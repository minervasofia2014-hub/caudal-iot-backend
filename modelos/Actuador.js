//Se trae la la libreria de la base de datos de MongoDb
const mongoose = require('mongoose');

//Ete esquema guarda el estado real de cada electoválvula y de la bomba 
//se puede verificar si lo que se pidió en la web realmente se aplicó en el ESP32
const esquemaActuador = new mongoose.Schema({
    //Identificar el único actuador que puede ser: la "electoválvula 1" (Bocatoma), "electoválvula 2" (Ramal 1),
    // "electoválvula 3" (Ramal 2)  y la bomba
    nombre_actuador: { type: String, required: true, unique: true },
    //El tipo de actuador que puede ser las "electroválvulas" o la "bomba"
    tipo_actuador: { type: String, required: true },
    //Lugar físico donde se instalo que puede ser la "Bocatoma", "Ramal 1", "Ramal 2"
    lugar_instalacion: { type: String, default: '' },
    //Lo que la web envia que puede ser: "ABIERTA", "CERRADA", "ENCENDIDA", "APAGADA"
    estado_solicitado: { type: String, default: null },
    //Lo que el usuario envío el comando desde el panel de control
    enviado_por: { type: String, default: null },
    //Momento exacto en el que se envió el comando 
    fecha_envio: { type: Date, default: null },
    //Estado que el ESP32 confirmó en su siguiente lectura por el MQTT
    estado_real: { type: String, default: null },
    //Momento en que se recibe la confirmación
    fecha_confirmada: { type: Date, default: null } 
}, {timestamps: true });

//Se exporta el modelo "Actuador", ya que lo usaremos en el resto de la aplicación para consultar y guardar estados
module.exports = mongoose.model('Actuador', esquemaActuador, 'actuadores');