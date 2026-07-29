//Se trae la la libreria de la base de datos de MongoDb
const mongoose = require('mongoose');

//Este esquema es el que guarda el historial de las fugas dectectadas
//Con eso no tenemos que recalcular todo cada vez que alguien abre el panel web
const esquemaAlerta = new mongoose.Schema({
    //Tipo de alerta: Si hay fuga en el acueducto veredal
    tipo_alerta: { type: String , required: true },
    //Texto que se va a mostrar en el dashboard, por ejemplo: "Fuga detectada -Pérdida: 520mL/minutos"
    mensaje_alerta:  { type: String, required: true },
    //La cantidad de agua que se está perdiendo, medida en mililitros por minuto
    perdida_por_minuto: { type: Number, default: 0 },
    //Indica que la alerta ya se soluciono o si sigue activa la fuga
    solucionada_alerta: { type: Boolean, default: false },
    //Momento que se marcó como solucionada
    fecha_solucion_alerta: { type: Date, default: null } 
}, {timestamps: true });

//Exportaremos el modelo "Alerta" que se va autilizar para consultar y guardar las fugas dectectadas 
module.exports = mongoose.model('Alerta', esquemaAlerta);