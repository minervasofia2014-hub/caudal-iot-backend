//Se importa la librería Express, está nos permite crear un servidor web y manejar las rutas
const express = require('express');
//Se crea un "router", esto lo que hace es utilizar un mini-servidor dentro de Express para organizar las rutas
const router = express.Router();
//Se importa la función "verificarToken", esto asegura que solo los usuarios autenticados accedan a estas rutas
const { verificarToken, verificarAdmin } = require('./auth');
//Importamos la conexion del MQTT, que nos permite enviar comandos a los dispositivos
const conexionMqtt = require('../mqtt/mqttCliente');
//También se importan los modelos que vamos a usar ya que podemos usarlos como:
//Medición (lecturas de los sensores), Actuador (electroválvulas y la bomba) y la Alerta (fugas)
const Medicion = require('../modelos/Medicion');
const Actuador = require('../modelos/Actuador');
const Alerta = require('../modelos/Alerta');
//Modelo que guarda el "punto cero" cuando un administrador reinicia el sistema
const Reinicio = require('../modelos/Reinicio');

//Aca se definen los topics de MQTT para cada electroválvulas (pero cada electoválvula tiene su canal de comunicación)
const TOPICS_VALVULA = {
    //Esta electroválvula de la bocatoma
    ev01: 'esp32/agua/ev01',
    //Esta electoválvula es del ramal 1
    ev02: 'esp32/agua/ev02',
    //Esta electoválvula es del ramal 2
    ev03: 'esp32/agua/ev03',
};

//Aca se define la ubicacion física de cada electroválvula para mostrar la información más clara
const UBICACION_VALVULA = {
    ev01: 'Bocatoma',
    ev02: 'Ramal 1',
    ev03: 'Ramal 2',
};

//Aca se crea la ruta de "POST" para enviar comandos de la electroválvula de (abrir o cerrar)
router.post('/valvula/', verificarToken, async(req, res) => {
    try {
        //Aca se obtiene el sensor y la acción desde el cuerpo de la petición 
        const { sensor, accion } = req.body;
        //Aca se busca el topic correspondiente a cada sensor
        const topic = TOPICS_VALVULA[sensor];
        //Si el sensor no existe entonces se devuelve error
        if (!topic) return res.status(400).json({ detail: 'Sensor no valido' });
        //Aca se valida que acción sea si es "ABRIR" o "CERRAR"
        if (!['ABRIR', 'CERRAR'].includes(accion)) {
            return res.status(400).json({detail: 'Acción no válida' });
        }

        //Aca se publica el comando en el broker MQTT para que el ESP32 lo reciba 
        conexionMqtt.publish(topic, accion, { retain: true });

        //Aca se guarda o se actualiza el estado del actuador en la base de datos
        await Actuador.findOneAndUpdate(
            //Aca se busca por el nombre del actuador
            { nombre_actuador: sensor },
            {
                $set: {
                    //Se mira que tipo de dispositivo es
                    tipo_actuador: 'valvula',
                    //Aca se mira la ubicación físisca
                    lugar_instalacion: UBICACION_VALVULA[sensor] || '',
                    //Aca es el estado solicitado si se abre o se cierra
                    estado_solicitado: accion === 'ABRIR' ? 'ABIERTA' : 'CERRADA',
                    //Aca es el usuario que envio la solicitud
                    enviado_por: req.usuario.usuario,
                    //Aca nos da la fecha en la cual se envio la solicitud
                    fecha_envio: new Date(),
                },
                //Si no existe se crea uno nuevo
                $setOnInsert: { nombre_actuador: sensor },
            },
            //Si no existe, lo crea
            { upsert: true}
        );
        //Aca se responde confirmando el envío del comando
        res.json({ detail: `comando ${accion} enviado a ${sensor} `});
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se crea la ruta de "GET" esta es para listar los actuadores resgistrados 
router.get('/actuadores/', verificarToken, async (req, res) => {
    try {
        //Aca busca a todos los actuadores y los va a ordenar por el nombre 
        const actuadores = await Actuador.find().sort({ nombre_actuador: 1 });
        //Se responde con la lista pero en formato json
        res.json(actuadores);
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se crea la ruta de "GET" esta es para listar los alertas resgistrados 
router.get('/alertas/', verificarToken, async (req, res) => {
    try {
        //  Aca se buscan las alertas más recientes  y se ordenan por fecha de creación más reciente
        const alertas = await Alerta.find().sort({ createdAt: -1 }).limit(50);
        //Se responde con la lista pero en formato json
        res.json(alertas);
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se crea la ruta de "GET" para mostrar en el dashboardcon datos de sensores, alertas y estadísticas
router.get('/dashboard/', verificarToken, async (req, res) => {
    try {
        //Aca se obtienen las úlyimas lecturas de cada sensor 
        const [sensor01] = await Medicion.find({ sensor_id: 'sensor_01' }).select('total_mL caudal_mLmin fecha_esp32 createdAt').sort({ createdAt: -1 }).limit(1).lean();
        const [sensor02] = await Medicion.find({ sensor_id: 'sensor_02' }).select('total_mL caudal_mLmin fecha_esp32 createdAt').sort({ createdAt: -1 }).limit(1).lean();
        const [sensor03] = await Medicion.find({ sensor_id: 'sensor_03' }).select('total_mL caudal_mLmin fecha_esp32 createdAt').sort({ createdAt: -1 }).limit(1).lean();
        //Aca solo se obtienen las 100 últimas lecturas que se mostraran en el dashboard
        const recientes = await Medicion.find().select('sensor_id caudal_mLmin total_mL fecha_esp32 createdAt origen_dato').sort({ createdAt: -1 }).limit(100).lean();
        //Aca se trae el último reinicio para saber desde qué valor mostrar el acumulado en 0
        const ultimoReinicio = await Reinicio.findOne().sort({ createdAt: -1 });
        const off1 = ultimoReinicio?.offset_s1 || 0;
        const off2 = ultimoReinicio?.offset_s2 || 0;
        const off3 = ultimoReinicio?.offset_s3 || 0;
        const offPorSensor = { sensor_01: off1, sensor_02: off2, sensor_03: off3 };
        //Resta el punto cero al total del ESP32. Si el ESP32 se reinició (total < offset),
        //muestra el total tal cual para que se recupere solo.
        const ajustarTotal = (total, off) => {
            total = total || 0;
            return total < off ? total : total - off;
        };

        //Aca se calcula los caudales de entrada y salida  
        const caudal01 = sensor01?.caudal_mLmin || 0;
        const caudal02 = sensor02?.caudal_mLmin || 0;
        const caudal03 = sensor03?.caudal_mLmin || 0;
        const totalSalida = caudal02 + caudal03;
        const perdida = Math.max(0, caudal01 - totalSalida);

        // ===== Balance por VOLUMEN acumulado sobre una ventana de tiempo =====
        // En vez de comparar el caudal instantáneo (la "foto" de la última lectura, que
        // llega en momentos distintos por cada sensor), comparamos cuánto volumen real
        // (total_mL) pasó por cada sensor durante la MISMA ventana. Así desaparecen las
        // pérdidas fantasma del arranque y de las lecturas no simultáneas.
        const VENTANA_MIN = 5; // minutos de ventana para el balance

        // ---- SINCRONIZACIÓN: los tres sensores se miden en el MISMO instante ----
        // Antes cada sensor terminaba en su propia última lectura (llegaban desfasadas
        // por unos segundos). Ahora fijamos un punto final COMÚN (tFin) que es la última
        // lectura que los TRES sensores ya alcanzaron, y medimos a todos en la misma
        // ventana [tInicio, tFin]. Así las tres marcaciones corresponden al mismo periodo.
        async function ultimaFecha(sensorId) {
            const [u] = await Medicion.find({ sensor_id: sensorId })
                .select('createdAt').sort({ createdAt: -1 }).limit(1).lean();
            return u ? u.createdAt.getTime() : null;
        }
        const finesSensores = (await Promise.all(
            ['sensor_01', 'sensor_02', 'sensor_03'].map(ultimaFecha)
        )).filter(v => v !== null);
        // el más antiguo de las últimas lecturas -> punto donde los tres ya tienen dato
        const tFin = finesSensores.length ? Math.min(...finesSensores) : Date.now();
        const tInicio = tFin - VENTANA_MIN * 60 * 1000;

        // Volumen (mL) y caudal promedio (mL/min) de un sensor DENTRO de la ventana común
        async function volumenVentana(sensorId) {
            const [primero] = await Medicion.find({ sensor_id: sensorId, createdAt: { $gte: new Date(tInicio) } })
                .select('total_mL createdAt').sort({ createdAt: 1 }).limit(1).lean();
            const [ultimo] = await Medicion.find({ sensor_id: sensorId, createdAt: { $lte: new Date(tFin) } })
                .select('total_mL createdAt').sort({ createdAt: -1 }).limit(1).lean();
            if (!primero || !ultimo) return { volumen: 0, minutos: 0, caudal: 0 };

            let volumen = (ultimo.total_mL || 0) - (primero.total_mL || 0);
            // Si el ESP32 se reinició, total_mL vuelve a 0 y la resta da negativo:
            // en ese caso usamos el acumulado actual como mejor aproximación.
            if (volumen < 0) volumen = ultimo.total_mL || 0;

            const minutos = (ultimo.createdAt.getTime() - primero.createdAt.getTime()) / 60000;
            const caudal = minutos > 0.1 ? volumen / minutos : 0;
            return { volumen, minutos, caudal };
        }

        const vent01 = await volumenVentana('sensor_01');
        const vent02 = await volumenVentana('sensor_02');
        const vent03 = await volumenVentana('sensor_03');

        const entradaProm = vent01.caudal;
        const salidaProm = vent02.caudal + vent03.caudal;
        const perdidaProm = Math.max(0, entradaProm - salidaProm);
        const eficienciaProm = entradaProm > 0
            ? Math.min(100, (salidaProm / entradaProm) * 100)
            : 100;

        const balance = {
            ventana_min: VENTANA_MIN,
            // Caudales PROMEDIO en la ventana (mL/min), calculados con volumen real
            entrada_prom: Number(entradaProm.toFixed(1)),
            salida1_prom: Number(vent02.caudal.toFixed(1)),
            salida2_prom: Number(vent03.caudal.toFixed(1)),
            perdida_prom: Number(perdidaProm.toFixed(1)),
            eficiencia_prom: Number(eficienciaProm.toFixed(1)),
            // Volúmenes reales acumulados en la ventana (mL), por si se quieren mostrar
            volumen_entrada: Number(vent01.volumen.toFixed(1)),
            volumen_salida: Number((vent02.volumen + vent03.volumen).toFixed(1)),
        };

        //Aca se determina el estado del sistema según las lecturas
        let estado = 'desconectado';
        if (sensor01) {
            const antiguedadMs = Date.now() - sensor01.createdAt.getTime();
            if (antiguedadMs > 15000) {
                //Si la última lectura es muy vieja
                estado = 'desconectado';
            } else if (caudal01 === 0) {
                //Si no esta entrando agua
                estado = 'seco';
            } else if (perdida > 500){
                //Si la pérdida de agua es muy alta 
                estado = 'exceso';
            } else {
                //Todo esta bien en el caudal
                estado = 'normal';
            }
        }

        //Aca se busca una alerta activa 
        const alertaActiva = await Alerta.findOne({ solucionada_alerta: false }).sort({ createdAt: -1 });

        //Se calculan fechas para estadísticas diarias y mensules 
        const hoy = new Date();
        //Aca es el inicio del día
        hoy.setHours(0, 0, 0, 0);
        //Aca es el inicio del mes
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

        //Aca se calculan las estadísticas del día y del mes con AGREGACIÓN en MongoDB.
        //Así el cálculo (contar, promedio, máximo, mínimo) lo hace la base de datos y NO se
        //traen miles de documentos a la memoria de Node (eso era lo que tumbaba el servidor).
        const [aggHoy] = await Medicion.aggregate([
            { $match: { sensor_id: 'sensor_01', createdAt: { $gte: hoy } } },
            { $group: { _id: null, total: { $sum: 1 }, promedio: { $avg: '$caudal_mLmin' }, maximo: { $max: '$caudal_mLmin' }, minimo: { $min: '$caudal_mLmin' } } }
        ]);
        const [aggMes] = await Medicion.aggregate([
            { $match: { sensor_id: 'sensor_01', createdAt: { $gte: inicioMes } } },
            { $group: { _id: null, total: { $sum: 1 }, maximo: { $max: '$caudal_mLmin' } } }
        ]);

        const totalLecturasHoy = aggHoy?.total || 0;
        const promedioHoy = aggHoy ? (aggHoy.promedio || 0).toFixed(1) : 0;
        const maximoHoy = aggHoy ? (aggHoy.maximo || 0).toFixed(1) : 0;
        const minimoHoy = aggHoy ? (aggHoy.minimo || 0).toFixed(1) : 0;
        const totalLecturasMes = aggMes?.total || 0;
        const maximoMes = aggMes ? (aggMes.maximo || 0).toFixed(1) : 0;

        //Aca se obtienen todos los actuadores que estan registrados en la base de datos
        const actuadores = await Actuador.find();
        //Aca se responde al cliente con un objeto JSON que contiene toda la información del dashboard
        res.json({
            //Balance hídrico calculado por volumen real acumulado en una ventana de tiempo
            balance,
            //Aca esta la sección con la última lectura del sensor principal y sus datos derivados
            latest: {
                reading: {
                    //Aca se identifica el sensor de la bocatoma
                    sensor_id: 'sensor_01',
                    //Aca es el caudal de entrada se mide en mL/min
                    caudal_mLmin: caudal01,
                    //Caudal del ramal 2
                    caudal_s2: caudal02,
                    //Caudal del ramal 3
                    caudal_s3: caudal03,
                    //Aca es el volumen acumulado en el sensor 1 (descontando el punto de reinicio)
                    total_s1: ajustarTotal(sensor01?.total_mL, off1),
                    //Aca es el volumen acumulado en el sensor 2 (descontando el punto de reinicio)
                    total_s2: ajustarTotal(sensor02?.total_mL, off2),
                    //Aca es el volumen acumulado en el sensor 3 (descontando el punto de reinicio)
                    total_s3: ajustarTotal(sensor03?.total_mL, off3),
                    //Aca es la diferencia entre la entrada y salida del caudal una posible fuga debe tener
                    perdida,
                    //Fecha de la última lectura del sensor 1 
                    fecha_s1: sensor01?.fecha_esp32 || sensor01?.createdAt || null,
                    //Fecha de la última lectura del sensor 2
                    fecha_s2: sensor02?.fecha_esp32 || sensor02?.createdAt || null,
                    //Fecha de la última lectura del sensor 3
                    fecha_s3: sensor03?.fecha_esp32 || sensor03?.createdAt || null,
                },
                //Aca es el estado general del sistema que puede ser: normal, seco, exceso y desconesctado
                estado,
                //Aca esta el mensaje de aletta si existe alguna activa 
                alerta: alertaActiva ? alertaActiva.mensaje_alerta : null,
            },
            //Sección con las lecturas más recientes (últimas 100)
            recent_readings: recientes.map(d => ({
                //El identificador único de la lectura 
                id: d._id,
                //Cuál es el sensor que generó la lectura
                sensor_id: d.sensor_id,
                //Caudal medido en esta lectura
                caudal_entrada: d.caudal_mLmin || 0,
                //Volumen acumulado hasta esta lectura (descontando el punto de reinicio)
                total_mL: ajustarTotal(d.total_mL, offPorSensor[d.sensor_id] || 0),
                //Fecha registrada por el ESP32 o por la base de datos
                fecha: d.fecha_esp32 || d.createdAt,
                //Estado general del sistema en este momento 
                estado,
                //Aca dice la fuenre del dato por ejemplo: ESP32-MQTT
                origen_dato: d.origen_dato,
            })),
            //Sección con las estadísticas de las lecturas
            stats: {
                daily: {
                    //Número de lecturas registradas hoy 
                    total_lecturas: totalLecturasHoy,
                    //Aca dice el promedio del caudal hoy
                    promedio_caudal: promedioHoy,
                    //Cual fue el caudal máximo registrado hoy
                    maximo_caudal: maximoHoy,
                    //Cual fue el caudal minimo resgidtrado hoy
                    minimo_caudal: minimoHoy,
                },
                monthly: {
                    //Número de lecturas registradas en el mes
                    total_lecturas: totalLecturasMes,
                    //Caudal máximo registrados en el mes 
                    maximo_caudal: maximoMes,
                },
            },
            //Aca es la lista completa de los actuadores registrados en la base de datos
            actuadores,
            //Se lista las alertas activas (si existe alguna, se devuelve en un arreglo)
            active_alerts: alertaActiva ? [alertaActiva] : [],
        });
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se crea la ruta "POST /reiniciar/" para poner los 3 sensores en 0 (SOLO administradores).
//Como no tocamos el firmware del ESP32 (él sigue contando), guardamos el total_mL actual de
//cada sensor como "punto cero" y de ahí en adelante el dashboard muestra el acumulado desde 0.
//También se borra el historial de mediciones para que las gráficas y la tabla arranquen limpias.
router.post('/reiniciar/', verificarToken, verificarAdmin, async (req, res) => {
    try {
        //Aca se toma la última lectura de cada sensor para saber en cuánto va su contador
        //y de paso guardar la "foto" historica (total mostrado y ultimo caudal).
        const [s1] = await Medicion.find({ sensor_id: 'sensor_01' }).select('total_mL caudal_mLmin').sort({ createdAt: -1 }).limit(1).lean();
        const [s2] = await Medicion.find({ sensor_id: 'sensor_02' }).select('total_mL caudal_mLmin').sort({ createdAt: -1 }).limit(1).lean();
        const [s3] = await Medicion.find({ sensor_id: 'sensor_03' }).select('total_mL caudal_mLmin').sort({ createdAt: -1 }).limit(1).lean();

        //Descuento del reinicio anterior, para guardar el total tal como se veia en pantalla
        const rPrevio = await Reinicio.findOne().sort({ createdAt: -1 });
        const oPrev1 = rPrevio?.offset_s1 || 0;
        const oPrev2 = rPrevio?.offset_s2 || 0;
        const oPrev3 = rPrevio?.offset_s3 || 0;
        const mostrado = (total, off) => { total = total || 0; return total < off ? total : total - off; };

        //Aca se guarda el punto cero (offset) de cada sensor + el REGISTRO HISTORICO
        //de como quedo el sistema justo antes de reiniciar.
        await Reinicio.create({
            offset_s1: s1?.total_mL || 0,
            offset_s2: s2?.total_mL || 0,
            offset_s3: s3?.total_mL || 0,
            reiniciado_por: req.usuario?.usuario || '',
            //foto historica: volumen que se veia en pantalla y ultimo caudal
            historico_total_s1: mostrado(s1?.total_mL, oPrev1),
            historico_total_s2: mostrado(s2?.total_mL, oPrev2),
            historico_total_s3: mostrado(s3?.total_mL, oPrev3),
            historico_caudal_s1: s1?.caudal_mLmin || 0,
            historico_caudal_s2: s2?.caudal_mLmin || 0,
            historico_caudal_s3: s3?.caudal_mLmin || 0,
        });

        //Aca se borra el historial de mediciones para empezar de cero (gráficas y tabla)
        await Medicion.deleteMany({});

        //Aca se cierran las alertas que estuvieran activas
        await Alerta.updateMany(
            { solucionada_alerta: false },
            { $set: { solucionada_alerta: true, fecha_solucion_alerta: new Date() } }
        );

        //Aca se responde confirmando el reinicio
        res.json({ detail: 'Sistema reiniciado. Los 3 sensores vuelven a 0.' });
    } catch (err) {
        //Si ocurre un error se devuelve el detalle
        res.status(500).json({ detail: err.message });
    }
});

//Se exporta el router con el fin de que se pueda seguir usando en el resto de aplicación
module.exports = router;