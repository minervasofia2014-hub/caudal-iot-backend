//Importamos la conexion del MQTT
const conexionMqtt = require('./mqttCliente');
//También se importan los modelos que vamos a usar ya que podemos usarlos como:
//Medición (lecturas de los sensores), Actuador (electroválvulas y la bomba) y la Alerta (fugas)
const Medicion = require('../modelos/Medicion');
const Actuador = require('../modelos/Actuador');
const Alerta = require('../modelos/Alerta');
//Modelo del historial resumido (promedios por bloque)
const HistorialCaudal = require('../modelos/HistorialCaudal');

//Cada cuántas lecturas de un sensor se promedia y se archiva un bloque
const BLOQUE_HISTORIAL = 100;
//Cuántas lecturas recientes se CONSERVAN sin borrar (las necesita el balance
//en vivo de los últimos 5 min). Con 100, el balance nunca se queda sin datos.
//Si quieres borrar exactamente las 100 al promediar, pon BUFFER_RECIENTES = 0.
const BUFFER_RECIENTES = 100;
//Evita que dos mensajes casi simultáneos disparen el mismo archivado
const archivadoEnCurso = {};

//Aca se define el tema (topic) de MQTT que vamos a llamar 
//El simbolo "+" en MQTT es un comodín ya que puede capturar cualquier tema de un nivel,
//Por ejemplo: sensor01, ev01, etc
const TOPIC_SENSORES = 'esp32/agua/+';

//Si la pérdida de agua supera este umbral, lo consideraremos como fuga
const UMBRAL_FUGA_MLMIN = 500;

//La ventana de tiempo para no repetir la misma alerta cada segundo 
const VENTANA_ALERTA_MS = 60 * 1000;

//Relación entre los sensores y las electoválvulas para saber a cuál correponde a cuál
const SENSOR_A_VALVULA = {
    sensor_01: 'ev01', //bocatoma
    sensor_02: 'ev02', //ramal 1
    sensor_03: 'ev03', //ramal 2
};

// Está función lo que hace es actualizar el estado real de cada dispositivo si es la electroválvula o la bomba
//Según lo que el ESP32 confirme en su lectura
async function actualizarEstadoReal(nombreActuador, tipoActuador, ubicacion, estadoReal) {
    //Si no hay estado no se hace nada
    if (!estadoReal) return;
    try {
        //Aca se busca si el actuador en a base de datos  y actualizamos su información
        await Actuador.findOneAndUpdate(
            //Aca se identifica por el nombre
            { nombre_actuador: nombreActuador },
            {
                $set: {
                    //Aca es por el tipo de actuador
                    tipo_actuador: tipoActuador,
                    //Aca es la ubicación fisica del sensor 
                    lugar_instalacion: ubicacion,
                    //Aca es donde se confirma el estado
                    estado_real: estadoReal,
                    //Aca es donde se sabe en que momento se confirmo la información
                    fecha_confirmada: new Date(),
                },
                //Aca se mira si existe ese actuador o no
                $setOnInsert: { nombre_actuador: nombreActuador },
            },
            //Si no lo encuentra entonces lo inserta
            { upsert: true }
        );
    } catch (err) {
        //Si algo falla, se muestra en la consola el error 
        console.error(`[Ingesta] Error actualizando actuador ${nombreActuador}:`, err.message);
    }
}

//Aca se utiliza la funcion que evaluá si hay fuga comparando la bocatoma de entrada vs salida
async function evaluarFuga() {
    try {
        //Se trae la última lectura de cada sensor 
        const [s1] = await Medicion.find({ sensor_id: 'sensor_01' }).sort({ createdAt: -1 }).limit(1);
        const [s2] = await Medicion.find({ sensor_id: 'sensor_02' }).sort({ createdAt: -1 }).limit(1);
        const [s3] = await Medicion.find({ sensor_id: 'sensor_03' }).sort({ createdAt: -1 }).limit(1);

        //Si no hay lectura de la bocatoma, no se puede calcular nada
        if (!s1) return;

        //Aca se hace es calcular la entrada que es la "bocatoma" y l salida son los "ramales"
        const entrada = s1.caudal_mLmin || 0;
        const salida = (s2?.caudal_mLmin || 0) + (s3?.caudal_mLmin || 0);
        //La pérdida de agua deñ acueducto veredal es la diferencia de la entrada y las salidas
        const perdida = Math.max(0, entrada - salida);
        //Aca se revisa si hay una alerta que este activa de fuga
        const alertaActiva = await Alerta.findOne({ tipo_alerta: 'fuga', solucionada_alerta: false }).sort({ createdAt: -1 });

        // Aca se mira si la pérdida de agua del caudal es superada por el umbral  y hay agua que esta entrando ...
        if (perdida > UMBRAL_FUGA_MLMIN && entrada > 0) {
            //Se hace la verificación que no se haya avisado hace muy poco la fuga 
            const yaAvisada = alertaActiva && (Date.now() - alertaActiva.createdAt.getTime() < VENTANA_ALERTA_MS);
            if (!yaAvisada) {
                //Aca se crea una nueva alerta de fuga 
                await Alerta.create({
                    tipo_alerta: 'fuga',
                    mensaje_alerta: `Fuga detectada - Perdida: ${perdida.toFixed(1)} mL/min`,
                    perdida_por_minuto: perdida,
                });
                console.log(`[Alerta] Fuga detectada: ${perdida.toFixed(1)} mL/min`);
            }
        } else if (alertaActiva) {
            //Aca se verifica que si fuga volvio a la normalidad, cerramos la alerta activa
            alertaActiva.solucionada_alerta = true;
            alertaActiva.fecha_solucion_alerta = new Date();
            await alertaActiva.save();
        }
    } catch (err) {
        //Aca se mira sia algo fallo en el cálculo, se muestra un error 
        console.error(`[Ingesta] Error evaluando fuga:`, err.message);
    }
}

//Aca se archiva el historial: cuando un sensor acumula suficientes lecturas,
//se promedia el bloque más antiguo de 100, se guarda ese promedio y se borran
//esas 100 lecturas crudas de la colección de mediciones.
async function acumularHistorial(sensorId, ubicacion) {
    //Si ya hay un archivado en curso para este sensor, no se repite
    if (archivadoEnCurso[sensorId]) return;
    try {
        //Cuántas lecturas crudas hay de este sensor
        const total = await Medicion.countDocuments({ sensor_id: sensorId });
        //Solo se archiva cuando hay al menos un bloque completo + el buffer reciente
        if (total < BLOQUE_HISTORIAL + BUFFER_RECIENTES) return;

        archivadoEnCurso[sensorId] = true;

        //Se toman las 100 lecturas MÁS ANTIGUAS (las que ya se pueden archivar)
        const lote = await Medicion.find({ sensor_id: sensorId })
            .sort({ createdAt: 1 }).limit(BLOQUE_HISTORIAL)
            .select('caudal_mLmin createdAt').lean();
        if (lote.length < BLOQUE_HISTORIAL) { archivadoEnCurso[sensorId] = false; return; }

        //Promedio del caudal de ese bloque
        const suma = lote.reduce((acc, d) => acc + (d.caudal_mLmin || 0), 0);
        const promedio = suma / lote.length;

        //Se guarda UNA fila en el historial con el promedio del bloque
        await HistorialCaudal.create({
            sensor_id: sensorId,
            ubicacion: ubicacion || '',
            caudal_promedio: Number(promedio.toFixed(2)),
            muestras: lote.length,
            desde: lote[0].createdAt,
            hasta: lote[lote.length - 1].createdAt,
        });

        //Se borran las 100 lecturas crudas ya promediadas
        const ids = lote.map(d => d._id);
        await Medicion.deleteMany({ _id: { $in: ids } });

        console.log(`[Historial] ${sensorId}: promedio ${promedio.toFixed(1)} mL/min de ${lote.length} lecturas (archivadas y borradas)`);
    } catch (err) {
        console.error(`[Historial] Error archivando ${sensorId}:`, err.message);
    } finally {
        archivadoEnCurso[sensorId] = false;
    }
}

//Aca se inicia la función donde se ingesta los datos desde MQTT
function iniciarIngesta() {
    //Se suscriben al topic de los sensores
    conexionMqtt.subscribe(TOPIC_SENSORES, (err) => {
        if (err) {
            console.error(`[Ingesta] No se puede suscribir a`, TOPIC_SENSORES, err.message);
        } else {
            console.log(`[Ingesta] Suscrito a ${TOPIC_SENSORES}`);
        }
    });

    //Aca se mira el mensaje que esta llegando desde el MQTT
    conexionMqtt.on('message', async (topic, payloadBuf) => {
        //Solo nos interesan, los mensajes que estan enviando los sensores
        if (!topic.startsWith('esp32/agua/sensor')) return;

        let datos;
        try {
            //Aca lo que se hace es convertir ese mensaje en JSON
            datos = JSON.parse(payloadBuf.toString());
        } catch (err) {
            console.error(`[Ingesta] Payload no es JSON valido en ${topic}:`, payloadBuf.toString());
            return;
        }

        try {
            //Aca se guardan la lectura de  los sensores en la base de datos en MOngoDb
            await Medicion.create({
                sensor_id: datos.sensor_id,
                ubicacion: datos.ubicacion,
                caudal_mLmin: datos.caudal_mLmin,
                caudal_mLseg: datos.caudal_mLseg,
                total_mL: datos.total_mL,
                pulsos: datos.pulsos,
                estado_valvula: datos.ev || null,
                estado_bomba: datos.bomba || null,
                fecha_esp32: datos.fecha || null,
            });

            //Si el sensor es la electoválvula, este se actualiza su estado real
            const nombreValvula = SENSOR_A_VALVULA[datos.sensor_id];
            if (nombreValvula && datos.ev) {
                await actualizarEstadoReal(nombreValvula, 'valvula', datos.ubicacion, datos.ev);
            }
            //Si esl sensor es del "Ramal 2" y ese sensor tiene la bomba, entonces se actualiza la bomba
            if (datos.sensor_id === 'sensor_03' && datos.bomba) {
                await actualizarEstadoReal('bomba03', 'bomba', 'Ramal 2 (recirculacion)', datos.bomba);
            }
            //Si el sensor de la bocatoma, dectecta si hay flujo de agua 
            if (datos.sensor_id === 'sensor_01') {
                await evaluarFuga();
            }

            //Aca se revisa si toca archivar un bloque de 100 lecturas al historial
            await acumularHistorial(datos.sensor_id, datos.ubicacion);
        } catch (err) {
            //si algo falla al guardar la lectura, se mostrara el error
            console.error(`[Ingesta] Error guardando lectura de ${topic}:`, err.message);
        }
    });
}

//Se exporta la funcion de ingesta para que se pueda usarse en otras partes de la app
module.exports = { iniciarIngesta };