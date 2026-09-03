//Se importa la librería Express, está nos permite crear un servidor web y manejar las rutas
const express = require('express');
//Se crea un "router", esto lo que hace es utilizar un mini-servidor dentro de Express para organizar las rutas
const router = express.Router();
//Aca se importa bcryptjs, este sirve para encriptar las contraseñas y asi poderlas comparar de manera segura
const bcypy = require('bcryptjs');
//Se importa también el modelo de usuario, este es el que representa la colección de usuarios en la base de datos
const Usuario = require('../modelos/Usuario');
//También se importa las funciones de autenticación: verificarToken, verificarAdmin
const { verificarToken, verificarAdmin } = require('./auth');

//Aca se hace la ruta "GET" esta se usa para poder listar todos los usuarios (esto solo puede mirar el administrador"
router.get('/', verificarToken, verificarAdmin, async (req, res) => {
    try{
        //Buscamos a todos los usuarios en la base de datos
        //Pero excluimos la "contraseña" de cada usuario para mejor seguridad
        //También se ordena por la fecha de creación, mostrando primero los mas recientes 
        const usuarios = await Usuario.find().select('-contraseña').sort({ createdAt: -1 });
        res.json(usuarios);
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se hace la ruta "GET /mapa" que devuelve solo lo necesario para pintar a los usuarios
//en el mapa (nombre, si está activo y sus coordenadas). Cualquier usuario autenticado puede verla.
router.get('/mapa', verificarToken, async (req, res) => {
    try {
        //Se traen solo campos públicos (nunca la contraseña ni el correo)
        const usuarios = await Usuario.find()
            .select('usuario nombre apellido esta_activo latitud longitud sensor_asociado')
            .sort({ createdAt: -1 });
        res.json(usuarios);
    } catch (err) {
        res.status(500).json({ detail: err.message });
    }
});

//Aca se hace es la ruta de "POST" que este es para crear nuevos usuarios (solo los administradores)
router.post('/', verificarToken, verificarAdmin, async (req, res) => {
    try {
        //Aca se extrae los datos enviados en el cuerpo de la petición 
        const { usuario, contraseña, correo_electronico, nombre, apellido, es_administrador, esta_activo } = req.body;
        //Aca lo que se hace es verificar si ese nombre de usuario ya existe 
        const existe = await Usuario.findOne({ usuario });
        if (existe) return res.status(400).json({ detail: 'El usuario ya existe' });
        //Aca se encriptamos la contraseña antes de guardarla
        const hash = await bcypy.hash(contraseña, 10);
        //Aca se crae el nuevo usuario en la base de datos
        const nuevoUsuario = await Usuario.create({
            usuario,
            contraseña: hash,
            correo_electronico,
            nombre,
            apellido,
            //Por defecto ninguno es administrador
            es_administrador: es_administrador || false,
            //Por defecto esta activa la cuenta 
            esta_activo: esta_activo !== undefined ? esta_activo : true
        });
        //Aca se responde confirmando la creación y se devuelve el ID del nuevo usuario 
        res.json({ detail: 'Usuario creado', id: nuevoUsuario._id });
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se hace es la ruta de "PUT" que este es para editar un usuario que ya existe solo lo pueden hacer los administradores
router.put('/:id', verificarToken, verificarAdmin, async (req, res) => {
    try {
        //Aca se extrae los datos enviados en el cuerpo de la petición 
        const { usuario, contraseña, correo_electronico, nombre, apellido, es_administrador, esta_activo, latitud, longitud, sensor_asociado } = req.body;
        //Aca se crea un objeto con los datos actualizados
        const datosActualizados = { usuario, correo_electronico, nombre, apellido, es_administrador, esta_activo };

        //Coordenadas para el mapa: si vienen vacías se guardan como null, si no como número
        if (latitud !== undefined) datosActualizados.latitud = (latitud === '' || latitud === null) ? null : Number(latitud);
        if (longitud !== undefined) datosActualizados.longitud = (longitud === '' || longitud === null) ? null : Number(longitud);
        if (sensor_asociado !== undefined) datosActualizados.sensor_asociado = sensor_asociado || '';

        //Si se envio una nueva contraseña, se encripta antes de guardarla
        if (contraseña) {
            datosActualizados.contraseña = await bcypy.hash(contraseña, 10);
        }
        //Se actualizan el usuario en la base de datos usando su ID
        await Usuario.findByIdAndUpdate(req.params.id, datosActualizados);
        //Aca se responde confirmando la actualización de cada usuario
        res.json({ detail: 'Usuario actualizado' });
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se hace la ruta de "DELETE"  este es para eliminar un usuario eso solo lo hacen los administradores
router.delete('/:id', verificarToken, verificarAdmin, async (req, res) => {
    try {
        //Aca se elimina el usuario de la base de datos usando su ID
        await Usuario.findByIdAndDelete(req.params.id);
        //Aca se responde confirmando la eliminación de cada usuario 
        res.json({ detail: 'Usuario eliminado' });
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({detail: err.message });
    }
});

//Aca se hace la ruta de "PATCH" aca es para aprobar un usuario eso solo lo hace el administrador
router.patch('/:id/aprobar', verificarToken, verificarAdmin, async (req, res) => {
    try {
        //Aca se actualiza si la cuenta esta activa o no
        await Usuario.findByIdAndUpdate(req.params.id, { esta_activo: true });
        //Aca se responde si la cuenta esta activa o no 
        res.json({ detail: 'Usuario aprobado' });
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se exporta el router para que podamos seguirla usando en el reto de la app
module.exports = router;