//se trae la librería que se conecta Node.js con la base de datos de MongoDB
const mongoose = require('mongoose');

//Aca se guardan los usuarios que pueden entrar al dashboard
//En este esquema es de cada usuario: què campos va a tener y de que tipo 
const esquemaUsuario = new mongoose.Schema({
    //El nombre de cada usuario debe ser unico y no se puede repetir y este campo es obligatorio
    usuario: { type: String, required: true, unique: true },
    //La contraseña es obligatorio para poder iniciar sesión
    contraseña: { type: String, required: true },
    //El correo electrónico no es necesario para iniciar sesión
    correo_electronico: { type: String, default: '' },
    //El nombre no es necesario para iniciar sesión
    nombre: { type: String, default: '' },
    //El apellido no es necesario para iniciar sesión
    apellido: { type: String, default: '' },
    //Aca se sabe si es administrador o no lo es
    es_administrador: { type: Boolean, default: false },
    //Aca se sabe si la cuenta esta activa o inactiva para ser parte del sistema del acueducto veredal solo el administrador
    //puede dar ingreso
    esta_activo: { type: Boolean, default: false }
    //MongoDb agraga el tiempo real de cada creación o eliminacion de cada usuario 
}, {timestamps: true });

//Lo que hace es que el Schema en el modelo que vamos a usar en el resto del codigo para poderlo exportar 
module.exports = mongoose.model('Usuario', esquemaUsuario);