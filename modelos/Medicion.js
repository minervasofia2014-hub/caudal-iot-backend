//Se trae la la libreria de la base de datos de MongoDb
const mongoose = require('mongoose');

//Aca se guarda cada lectura que manda un ESP32 por MQTT
//Los primeros 6 campos son los que ya estan en el ESP32 no se pueden cambiar
const esquemaMedicion = new mongoose.Schema({
    //Aca se identifica que sensor de ESP32 esta enviando la señal
    sensor_id: { type: String, required: true },
    //Lugar donde esta ubicado el sensor
    ubicacion: { type: String, default: '' },
    //Flujo del agua medido en mililitros por minutos
    caudal_mLmin: { type: Number, default: 0 },
    //Flujo del agua medido en mililitros por segundos
    caudal_mLseg: { type: Number, default: 0 },
    //La cantidad de agua total acuamulada 
    total_mL: { type: Number, default: 0 },
    //El numero de pulsos que dectecto cada sensor Yf-S401
    pulsos: { type: Number, default: 0 },

    //Este campo se añadio para: Indicar  si la electroválvula esta abierta o cerrada en el momento de la lectura
    estado_valvula: { type: String, default: null },

    //Aca solo va a enviar el sensor_03 que es el (ramal 2) ya que es el unico que cuenta con la bomba
    estado_bomba: { type: String, default: null },

    //Fecha y la hora que se armo con el propio ESP32 con su reloj interno que tiene
    //puede fallar la fecha y hora sino se logra la sicronización con rl NTP
    fecha_esp32: { type: String, default: null },

    //para saber de donde vino el dato, por si despues agregamos otra fuentes además del ESP32
    origen_dato: { type: String, default: 'ESP32-MQTT' }
}, { timestamps: true });

//Se crea un índice para que las consultas por cada sensor y fechas se han más rápidas y eficientes
esquemaMedicion.index({ sensor_id: 1, createdAt: -1 });

//Aca se exporta el modelo de "Medición", que se puede usar el resto de la aplicación
module.exports = mongoose.model('Medicion', esquemaMedicion, 'mediciones');