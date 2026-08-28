//Se trae la librería de MongoDB
const mongoose = require('mongoose');

//Aca se guarda el "punto cero" cada vez que un administrador reinicia el sistema.
//Como el ESP32 sigue contando su total_mL por su cuenta (y NO lo tocamos), guardamos
//cuánto llevaba cada sensor en el momento del reinicio. Después, en el dashboard,
//restamos ese valor para que el acumulado se muestre desde 0.
const esquemaReinicio = new mongoose.Schema({
    //Cuánto marcaba el total_mL de cada sensor justo cuando se reinició
    offset_s1: { type: Number, default: 0 },
    offset_s2: { type: Number, default: 0 },
    offset_s3: { type: Number, default: 0 },
    //Quién hizo el reinicio (para dejar registro)
    reiniciado_por: { type: String, default: '' },

    //---- REGISTRO HISTÓRICO: "foto" de cómo estaba el sistema antes de reiniciar ----
    //Volumen acumulado que mostraba cada sensor (ya con el descuento aplicado)
    historico_total_s1: { type: Number, default: 0 },
    historico_total_s2: { type: Number, default: 0 },
    historico_total_s3: { type: Number, default: 0 },
    //Último caudal (mL/min) de cada sensor en el momento del reinicio
    historico_caudal_s1: { type: Number, default: 0 },
    historico_caudal_s2: { type: Number, default: 0 },
    historico_caudal_s3: { type: Number, default: 0 },
    //MongoDB agrega createdAt automáticamente
}, { timestamps: true });

//Se exporta el modelo (colección 'reinicios')
module.exports = mongoose.model('Reinicio', esquemaReinicio, 'reinicios');