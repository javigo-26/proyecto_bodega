IF DB_ID('proyecto_Bodega') IS NULL CREATE DATABASE proyecto_Bodega;
go
USE proyecto_Bodega; 
GO
-- =========================================================
-- 1. TABLA DE USUARIOS 
-- =========================================================
IF OBJECT_ID('Usuarios', 'U') IS NOT NULL DROP TABLE Usuarios;
--Esto detecta si ya existe la tabla en un inicio, si existe la borra, sino no hace nada

CREATE TABLE Usuarios (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(100) NOT NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO Usuarios (username, password, nombre_completo) 
VALUES ('admin', 'admin123', 'Administrador Bodega');


-- =========================================================
-- 2. TABLA DE CATÁLOGO DE ESTADOS (Normalización)
-- =========================================================
IF OBJECT_ID('Almacenamiento', 'U') IS NOT NULL DROP TABLE Almacenamiento;
IF OBJECT_ID('AutorizacionesRetiro', 'U') IS NOT NULL DROP TABLE AutorizacionesRetiro;
IF OBJECT_ID('EventosSeguridad', 'U') IS NOT NULL DROP TABLE EventosSeguridad;
IF OBJECT_ID('Operaciones', 'U') IS NOT NULL DROP TABLE Operaciones;
IF OBJECT_ID('Paquetes', 'U') IS NOT NULL DROP TABLE Paquetes;
IF OBJECT_ID('Espacios', 'U') IS NOT NULL DROP TABLE Espacios;
IF OBJECT_ID('Estados', 'U') IS NOT NULL DROP TABLE Estados;

CREATE TABLE Estados (
    id INT PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion VARCHAR(100) NULL
);

INSERT INTO Estados (id, nombre, descripcion) VALUES
(1, 'DISPONIBLE', 'Celda libre para almacenar'),
(2, 'PARCIAL', 'Celda con paquetes y cupo libre'),
(3, 'OCUPADO', 'Celda llena, sin cupo'),
(4, 'ALARMA', 'Movimiento o retiro no autorizado'),
(5, 'REGISTRADO', 'Paquete registrado en el sistema'),
(6, 'ASIGNADO', 'Paquete asignado a una celda'),
(7, 'ALMACENADO', 'Paquete guardado en celda'),
(8, 'RETIRO_AUTORIZADO', 'Ventana de retiro activa'),
(9, 'RETIRADO', 'Paquete retirado de la bodega');


-- =========================================================
-- 3. TABLA ESPACIOS
-- =========================================================
CREATE TABLE Espacios (
    codigo VARCHAR(5) PRIMARY KEY,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('NORMAL', 'FRAGIL')), -- Tipo fijo del casillero
    estado_id INT NOT NULL DEFAULT 1 FOREIGN KEY REFERENCES Estados(id),
    modo_tamano VARCHAR(10) NULL CHECK (modo_tamano IN ('PEQUENO', 'MEDIANO', 'GRANDE')),
    capacidad_max INT NOT NULL,
    ocupacion_actual INT NOT NULL DEFAULT 0
);

-- 3 compartimentos de la maqueta: A1 y A2 para paquetes normales, F1 solo para frágiles.
-- El primer paquete fija el tamaño del casillero hasta que se vacía.
INSERT INTO Espacios (codigo, tipo, estado_id, modo_tamano, capacidad_max, ocupacion_actual) VALUES
('A1', 'NORMAL', 1, NULL, 3, 0),
('A2', 'NORMAL', 1, NULL, 3, 0),
('F1', 'FRAGIL', 1, NULL, 3, 0);


-- =========================================================
-- 4. TABLA PAQUETES
-- =========================================================
CREATE TABLE Paquetes (
    id VARCHAR(10) PRIMARY KEY,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('NORMAL', 'FRAGIL')),
    tamano VARCHAR(10) NOT NULL CHECK (tamano IN ('PEQUENO', 'MEDIANO', 'GRANDE')),
    estado_id INT NOT NULL DEFAULT 5 FOREIGN KEY REFERENCES Estados(id),
    activo BIT NOT NULL DEFAULT 1, -- Eliminado logico: 0 = eliminado (la fila no se borra)
    descripcion NVARCHAR(200) NULL, -- Dato libre que escribe el operador en Recepción
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- =========================================================
-- 5. TABLAS COMPLEMENTARIAS
-- =========================================================
CREATE TABLE Almacenamiento (
    id INT IDENTITY(1,1) PRIMARY KEY,
    paquete_id VARCHAR(10) FOREIGN KEY REFERENCES Paquetes(id),
    espacio_codigo VARCHAR(5) FOREIGN KEY REFERENCES Espacios(codigo),
    fecha_ingreso DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_salida DATETIME NULL
);

CREATE TABLE AutorizacionesRetiro (
    id INT IDENTITY(1,1) PRIMARY KEY,
    paquete_id VARCHAR(10) FOREIGN KEY REFERENCES Paquetes(id),
    espacio_codigo VARCHAR(5) FOREIGN KEY REFERENCES Espacios(codigo),
    fecha_autorizacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    expiracion DATETIME NOT NULL,
    estado_id INT NOT NULL DEFAULT 8 FOREIGN KEY REFERENCES Estados(id)
);

CREATE TABLE EventosSeguridad (
    id INT IDENTITY(1,1) PRIMARY KEY,
    espacio_codigo VARCHAR(5) FOREIGN KEY REFERENCES Espacios(codigo),
    paquete_id VARCHAR(10) NULL,
    tipo_evento VARCHAR(30) NOT NULL,
    descripcion TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bitácora: cada operación hecha desde la pantalla o informada por el ESP32
CREATE TABLE Operaciones (
    id INT IDENTITY(1,1) PRIMARY KEY,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    instruccion NVARCHAR(100) NOT NULL,
    resultado VARCHAR(10) NOT NULL CHECK (resultado IN ('ACEPTADA', 'RECHAZADA', 'ALERTA')),
    detalle NVARCHAR(255) NULL,
    origen VARCHAR(10) NOT NULL DEFAULT 'PANTALLA' CHECK (origen IN ('PANTALLA', 'ESP32'))
);
GO

-- =========================================================
-- 6. FUNCIÓN DE VALIDACIÓN DE CAPACIDAD
-- =========================================================
CREATE OR ALTER FUNCTION fn_ValidarCapacidadEspacio (
    @codigo_espacio VARCHAR(5),
    @tipo_paquete VARCHAR(10),
    @tamano_paquete VARCHAR(10)
)
RETURNS BIT
AS
BEGIN
    DECLARE @puede_almacenar BIT = 0;
    DECLARE @modo_actual VARCHAR(10);
    DECLARE @tipo_actual VARCHAR(10);
    DECLARE @capacidad_max INT;
    DECLARE @ocupacion_actual INT;

    SELECT 
        @modo_actual = modo_tamano,
        @tipo_actual = tipo,
        @capacidad_max = capacidad_max,
        @ocupacion_actual = ocupacion_actual
    FROM Espacios WHERE codigo = @codigo_espacio;

    -- Solo recibe paquetes de su tipo. Vacío acepta cualquier tamaño;
    -- con paquetes dentro, solo el mismo tamaño y si le queda cupo.
    IF @tipo_actual = @tipo_paquete
       AND (@ocupacion_actual = 0 OR (@modo_actual = @tamano_paquete AND @ocupacion_actual < @capacidad_max))
        SET @puede_almacenar = 1;

    RETURN @puede_almacenar;
END;
GO

-- =========================================================
-- 7. STORED PROCEDURE ASIGNAR PAQUETE
-- =========================================================
CREATE OR ALTER PROCEDURE sp_AsignarPaqueteBodega
    @paquete_id VARCHAR(10),
    @tipo VARCHAR(10),
    @tamano VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    begin TRY
        IF NOT EXISTS (SELECT 1 FROM Paquetes WHERE id = @paquete_id)
        BEGIN
            INSERT INTO Paquetes (id, tipo, tamano, estado_id)
            VALUES (@paquete_id, @tipo, @tamano, 5);
        END

        DECLARE @espacio_asignado VARCHAR(5) = NULL;
        DECLARE @capacidad_max_seguntamano INT;

        SET @capacidad_max_seguntamano = CASE 
            WHEN @tamano = 'PEQUENO' THEN 3
            WHEN @tamano = 'MEDIANO' THEN 2
            WHEN @tamano = 'GRANDE'  THEN 1
        END;

        -- Primero completa un casillero que ya tenga ese tipo y tamaño; si no hay, usa uno vacío
        SELECT TOP 1 @espacio_asignado = codigo
        FROM Espacios
        WHERE estado_id IN (1, 2)
          AND dbo.fn_ValidarCapacidadEspacio(codigo, @tipo, @tamano) = 1
        ORDER BY CASE WHEN ocupacion_actual > 0 THEN 0 ELSE 1 END, codigo ASC;

        IF @espacio_asignado IS NULL
        BEGIN
            RAISERROR('No hay espacio disponible para las características del paquete.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        UPDATE Espacios
        SET modo_tamano = @tamano,
            capacidad_max = @capacidad_max_seguntamano,
            ocupacion_actual = ocupacion_actual + 1,
            estado_id = CASE 
                WHEN (ocupacion_actual + 1) >= @capacidad_max_seguntamano THEN 3
                ELSE 2
            END
        WHERE codigo = @espacio_asignado;

        INSERT INTO Almacenamiento (paquete_id, espacio_codigo)
        VALUES (@paquete_id, @espacio_asignado);

        UPDATE Paquetes SET estado_id = 6 WHERE id = @paquete_id;

        COMMIT TRANSACTION;

        SELECT @paquete_id AS paquete_id, @espacio_asignado AS espacio_asignado, 'ASIGNACION_EXITOSA' AS mensaje;
	end try
    begin CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO