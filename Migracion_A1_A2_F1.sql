-- =========================================================
-- MIGRACIÓN A 3 COMPARTIMENTOS: A1 y A2 (NORMAL), F1 (FRAGIL)
--
-- Actualiza una base de datos que YA TIENE REGISTROS, conservando su historial.
-- Sirve para las versiones anteriores del proyecto:
--   * 6 espacios: A1, A2, A3, A4, F1, F2   (se eliminan A3, A4 y F2)
--   * 3 espacios: C1, C2, C3               (C1 pasa a A1, C2 a A2 y C3 a F1)
--
-- Primero revisa las relaciones con la tabla Espacios. Si algo impide migrar,
-- muestra la lista de problemas y NO CAMBIA NADA.
-- (Si se cancela, SSMS puede mostrar después un error de fn_ValidarCapacidadEspacio: es consecuencia
--  de la cancelación, porque igual revisa el procedimiento aunque ya no lo ejecute. Tampoco cambia nada.)
--
-- Si la base solo tiene datos de prueba, es más simple ejecutar Query_Proyecto.sql completo.
-- =========================================================
USE proyecto_Bodega;
GO
SET NOEXEC OFF;
GO

-- =========================================================
-- 1. Equivalencias: código actual -> código nuevo (NULL = el compartimento desaparece)
-- =========================================================
IF OBJECT_ID('tempdb..#Mapa') IS NOT NULL DROP TABLE #Mapa;
IF OBJECT_ID('tempdb..#ValidacionOk') IS NOT NULL DROP TABLE #ValidacionOk;
CREATE TABLE #Mapa (actual VARCHAR(5) PRIMARY KEY, nuevo VARCHAR(5) NULL, tipo VARCHAR(10) NULL);

INSERT INTO #Mapa (actual, nuevo, tipo) VALUES
('A1', 'A1', 'NORMAL'), ('A2', 'A2', 'NORMAL'), ('F1', 'F1', 'FRAGIL'),
('C1', 'A1', 'NORMAL'), ('C2', 'A2', 'NORMAL'), ('C3', 'F1', 'FRAGIL');

-- Cualquier otro compartimento (A3, A4, F2...) deja de existir
INSERT INTO #Mapa (actual, nuevo, tipo)
SELECT codigo, NULL, NULL FROM Espacios WHERE codigo NOT IN (SELECT actual FROM #Mapa);
GO

-- =========================================================
-- 2. Validaciones de las relaciones (no cambia nada)
-- =========================================================
DECLARE @problemas TABLE (problema NVARCHAR(400));

-- 2.1 Dos compartimentos actuales no pueden terminar con el mismo código (por ejemplo, A1 y C1 a la vez)
INSERT INTO @problemas
SELECT CONCAT(N'Existen a la vez ', STRING_AGG(M.actual, ' y '), N'; ambos pasarían a ser ', M.nuevo, N'.')
FROM #Mapa M
INNER JOIN Espacios E ON E.codigo = M.actual
WHERE M.nuevo IS NOT NULL
GROUP BY M.nuevo
HAVING COUNT(*) > 1;

-- 2.2 Un compartimento que desaparece no puede tener paquetes dentro
INSERT INTO @problemas
SELECT CONCAT(N'El paquete ', A.paquete_id, N' está en ', A.espacio_codigo, N', que se eliminará. Retíralo antes de migrar.')
FROM Almacenamiento A
INNER JOIN #Mapa M ON M.actual = A.espacio_codigo
WHERE M.nuevo IS NULL AND A.fecha_salida IS NULL;

-- 2.3 Un compartimento no puede quedar con paquetes de otro tipo (por ejemplo, frágiles en A1)
INSERT INTO @problemas
SELECT CONCAT(N'El paquete ', P.id, N' (', P.tipo, N') está en ', A.espacio_codigo, N', que pasará a ser ',
              M.nuevo, N' (solo ', M.tipo, N'). Retíralo antes de migrar.')
FROM Almacenamiento A
INNER JOIN Paquetes P ON P.id = A.paquete_id
INNER JOIN #Mapa M ON M.actual = A.espacio_codigo
WHERE M.nuevo IS NOT NULL AND A.fecha_salida IS NULL AND P.tipo <> M.tipo;

-- 2.4 El historial de un compartimento que desaparece impide borrarlo (claves foráneas)
INSERT INTO @problemas
SELECT CONCAT(N'El compartimento ', R.codigo, N' se eliminará, pero tiene ', R.registros, N' registro(s) en ', R.tabla,
              N'. Para conservar ese historial no se puede borrar.')
FROM (
    SELECT espacio_codigo AS codigo, 'Almacenamiento' AS tabla, COUNT(*) AS registros
    FROM Almacenamiento WHERE fecha_salida IS NOT NULL GROUP BY espacio_codigo
    UNION ALL
    SELECT espacio_codigo, 'AutorizacionesRetiro', COUNT(*) FROM AutorizacionesRetiro GROUP BY espacio_codigo
    UNION ALL
    SELECT espacio_codigo, 'EventosSeguridad', COUNT(*) FROM EventosSeguridad GROUP BY espacio_codigo
) R
INNER JOIN #Mapa M ON M.actual = R.codigo
WHERE M.nuevo IS NULL;

IF EXISTS (SELECT 1 FROM @problemas)
BEGIN
    SELECT problema AS [No se puede migrar] FROM @problemas;
    RAISERROR(N'Migración cancelada: revisa la lista de problemas. No se cambió nada.', 16, 1);
    SET NOEXEC ON; -- los lotes siguientes no se ejecutan
END
ELSE
BEGIN
    CREATE TABLE #ValidacionOk (ok BIT); -- marca de que la validación terminó sin problemas
    PRINT N'Validaciones correctas: se aplica la migración.';
END
GO

-- Seguro: si la validación no terminó (por un problema o por cualquier error), no se sigue
IF OBJECT_ID('tempdb..#ValidacionOk') IS NULL
BEGIN
    RAISERROR(N'La validación no terminó correctamente; migración cancelada. No se cambió nada.', 16, 1);
    SET NOEXEC ON;
END
GO

-- =========================================================
-- 3. Columna y tabla de las versiones nuevas que pudieran faltar
-- =========================================================
IF COL_LENGTH('Paquetes', 'activo') IS NULL
    ALTER TABLE Paquetes ADD activo BIT NOT NULL DEFAULT 1; -- Eliminado lógico

IF COL_LENGTH('Paquetes', 'descripcion') IS NULL
    ALTER TABLE Paquetes ADD descripcion NVARCHAR(200) NULL; -- Dato libre que escribe el operador en Recepción

IF OBJECT_ID('Operaciones', 'U') IS NULL
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
-- 4. Renombrar y eliminar compartimentos (todo o nada)
-- =========================================================
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 4.1 Crear los códigos nuevos copiando el estado del compartimento que reemplazan (C1 -> A1...)
INSERT INTO Espacios (codigo, tipo, estado_id, modo_tamano, capacidad_max, ocupacion_actual)
SELECT M.nuevo, M.tipo, E.estado_id, E.modo_tamano, E.capacidad_max, E.ocupacion_actual
FROM #Mapa M
INNER JOIN Espacios E ON E.codigo = M.actual
WHERE M.nuevo IS NOT NULL AND M.nuevo <> M.actual
  AND NOT EXISTS (SELECT 1 FROM Espacios X WHERE X.codigo = M.nuevo);

-- 4.2 Mover las referencias del código viejo al nuevo (el historial se conserva)
UPDATE A SET espacio_codigo = M.nuevo
FROM Almacenamiento A INNER JOIN #Mapa M ON M.actual = A.espacio_codigo
WHERE M.nuevo IS NOT NULL AND M.nuevo <> M.actual;

UPDATE R SET espacio_codigo = M.nuevo
FROM AutorizacionesRetiro R INNER JOIN #Mapa M ON M.actual = R.espacio_codigo
WHERE M.nuevo IS NOT NULL AND M.nuevo <> M.actual;

UPDATE V SET espacio_codigo = M.nuevo
FROM EventosSeguridad V INNER JOIN #Mapa M ON M.actual = V.espacio_codigo
WHERE M.nuevo IS NOT NULL AND M.nuevo <> M.actual;

-- 4.3 Borrar los códigos viejos ya renombrados y los compartimentos que no existen en la maqueta
DELETE E
FROM Espacios E INNER JOIN #Mapa M ON M.actual = E.codigo
WHERE M.nuevo IS NULL OR M.nuevo <> M.actual;

-- 4.4 Tipo fijo de cada compartimento
UPDATE E SET tipo = M.tipo
FROM Espacios E INNER JOIN #Mapa M ON M.actual = E.codigo;

-- 4.5 Si faltara alguno de los tres, se crea vacío
INSERT INTO Espacios (codigo, tipo, estado_id, modo_tamano, capacidad_max, ocupacion_actual)
SELECT V.codigo, V.tipo, 1, NULL, 3, 0
FROM (VALUES ('A1', 'NORMAL'), ('A2', 'NORMAL'), ('F1', 'FRAGIL')) V (codigo, tipo)
WHERE NOT EXISTS (SELECT 1 FROM Espacios E WHERE E.codigo = V.codigo);

COMMIT TRANSACTION;
GO

-- =========================================================
-- 5. Función de capacidad (igual que en Query_Proyecto.sql)
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
-- 6. Procedimiento de asignación (igual que en Query_Proyecto.sql)
-- =========================================================
CREATE OR ALTER PROCEDURE sp_AsignarPaqueteBodega
    @paquete_id VARCHAR(10),
    @tipo VARCHAR(10),
    @tamano VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;

    BEGIN TRY
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
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- =========================================================
-- 7. Resultado: deben quedar solo A1, A2 y F1
-- =========================================================
SELECT E.codigo, E.tipo, Est.nombre AS estado, E.modo_tamano, E.ocupacion_actual, E.capacidad_max
FROM Espacios E
INNER JOIN Estados Est ON Est.id = E.estado_id
ORDER BY E.codigo;

DROP TABLE #Mapa;
DROP TABLE #ValidacionOk;
PRINT N'Migración terminada: compartimentos A1, A2 (NORMAL) y F1 (FRAGIL).';
GO

SET NOEXEC OFF;
GO
