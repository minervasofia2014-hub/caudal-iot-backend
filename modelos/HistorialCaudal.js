//Se trae la librería de MongoDB
const mongoose = require('mongoose');

//Aca se guarda el HISTORIAL resumido: en vez de conservar cada lectura cruda,
//se promedia el caudal de cada bloque de 100 lecturas por sensor y se guarda
//UNA fila con ese promedio. Después las 100 lecturas crudas se borran.
//Así la base no crece sin control y queda un histórico liviano para ver por
//semana o por mes.
const esquemaHistorial = new mongoose.Schema({
    //Sensor al que pertenece el promedio (sensor_01, sensor_02, sensor_03)
    sensor_id: { type: String, required: true },
    //Ubicación (Bocatoma, Ramal 1, Ramal 2)
    ubicacion: { type: String, default: '' },
    //Caudal promedio (mL/min) de las 100 lecturas del bloque
    caudal_promedio: { type: Number, default: 0 },
    //Cuántas lecturas se promediaron (normalmente 100)
    muestras: { type: Number, default: 0 },
    //Rango de tiempo que cubre el bloque promediado
    desde: { type: Date },
    hasta: { type: Date },
    //MongoDB agrega createdAt automáticamente (se usa para agrupar por semana/mes)
}, { timestamps: true });

//Índice para consultar y agrupar rápido por sensor y fecha
esquemaHistorial.index({ sensor_id: 1, createdAt: -1 });

//Se exporta el modelo (colección 'historial_caudal')
module.exports = mongoose.model('HistorialCaudal', esquemaHistorial, 'historial_caudal');