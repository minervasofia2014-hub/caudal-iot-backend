// Importamos la librería Express para manejar las rutas y el servidor HTTP
const express = require('express');
// Creamos un enrutador modular para agrupar todas las rutas de autenticación
const router = express.Router();
// Importamos bcryptjs para la encriptación de contraseñas de manera segura
const bcypy = require('bcryptjs');
// Importamos jsonwebtoken para generar y verificar los tokens de sesión (JWT)
const jwt = require('jsonwebtoken');
// Importamos el modelo de datos del Usuario para interactuar con la base de datos
const Usuario = require('../modelos/Usuario');
// Leemos la clave secreta desde las variables de entorno para firmar los JWT
const CLAVE_SECRETA = process.env.JWT_SECRET;

// MIDDLEWARE DE AUTENTICACIÓN

// Función middleware para verificar si el usuario envía un token válido
function verificarToken(req, res, next) {
    // Obtenemos el encabezado 'authorization', o una cadena vacía si no existe
    const cabecera = req.headers.authorization || '';
    
    // Extraemos la cadena del token removiendo el prefijo 'Token '
    const token = cabecera.replace('Token ', '');
    
    // Si no hay token en la petición, respondemos con error 401 (No autorizado)
    if (!token) return res.status(401).json({ detail: 'No autenticado' });
    
    try {
        // Verificamos el token con la clave secreta y guardamos los datos del usuario en req.usuario
        req.usuario = jwt.verify(token, CLAVE_SECRETA);
        
        // Continuamos con la ejecución del siguiente middleware o ruta
        next();
    } catch {
        // Si el token es inválido o expiró, devolvemos un error 401
        res.status(401).json({ detail: 'Token invalido' });
    }
}

// Función middleware para verificar si el usuario autenticado es administrador
function verificarAdmin(req, res, next) {
    // Si la propiedad es_administrador no existe o es falsa, denegamos el acceso (Error 403)
    if (!req.usuario?.es_administrador) return res.status(403).json({ detail: 'Solo administradores' });
    
    // Si es administrador, permitimos la ejecución del siguiente middleware o ruta
    next();
}

// RUTAS DE AUTENTICACIÓN

// Ruta POST para que los usuarios inicien sesión
router.post('/login/', async (req, res) => {
    try {
        // Extraemos el usuario y la contraseña enviados en el cuerpo de la petición (JSON)
        const { usuario, contraseña } = req.body;
        
        // Buscamos en la base de datos si existe un registro con ese nombre de usuario
        const usuarioEncontrado = await Usuario.findOne({ usuario });
        
        // Si el usuario no existe en la base de datos, devolvemos error 400
        if (!usuarioEncontrado) return res.status(400).json({ detail: 'Usuario no encontrado' });

        // Comparamos la contraseña en texto plano recibida con la contraseña encriptada en la BD
        const claveValida = await bcypy.compare(contraseña, usuarioEncontrado.contraseña);
        
        // Si las contraseñas no coinciden, devolvemos error 400
        if (!claveValida) return res.status(400).json({ detail: 'Contraseña incorrecta' });
        
        // Verificamos que la cuenta del usuario haya sido activada previamente por un admin
        if (!usuarioEncontrado.esta_activo) return res.status(400).json({ detail: 'Cuenta pendiente de aprobación' });

        // Firmamos y creamos el token JWT con los datos del usuario, fijando una expiración de 7 días
        const token = jwt.sign(
            { id: usuarioEncontrado._id, usuario: usuarioEncontrado.usuario, es_administrador: usuarioEncontrado.es_administrador },
            CLAVE_SECRETA,
            { expiresIn: '7d' }
        );
        
        // Devolvemos la respuesta exitosa con el token e información básica del usuario
        res.json({
            token,
            usuario: {
                id: usuarioEncontrado._id,
                usuario: usuarioEncontrado.usuario,
                correo_electronico: usuarioEncontrado.correo_electronico,
                nombre: usuarioEncontrado.nombre,
                apellido: usuarioEncontrado.apellido,
                es_administrador: usuarioEncontrado.es_administrador
            }
        });
    } catch (err) {
        // Ante cualquier error inesperado en el servidor, devolvemos un error 500
        res.status(500).json({ detail: err.message });
    }
});

// Ruta POST para registrar nuevos usuarios en el sistema
router.post('/register/', async (req, res) => {
    try {
        // Extraemos la información del nuevo usuario enviada en la petición
        const { usuario, contraseña, correo_electronico, nombre, apellido } = req.body;
        
        // Comprobamos si el nombre de usuario ya se encuentra registrado
        const existe = await Usuario.findOne({ usuario });
        
        // Si ya existe, evitamos duplicados enviando error 400
        if (existe) return res.status(400).json({ detail: 'El usuario ya existe' });

        // Encriptamos la contraseña del usuario antes de guardarla (10 rondas de hashing)
        const hash = await bcypy.hash(contraseña, 10);
        
        // Insertamos el nuevo usuario en la base de datos (inactivo y sin permisos de admin por defecto)
        await Usuario.create({
            usuario, contraseña: hash, correo_electronico, nombre, apellido,
            es_administrador: false, esta_activo: false
        });
        
        // Devolvemos respuesta informando que requiere aprobación previa
        res.json({ detail: 'Cuenta creada. Un administrador debe aprobar tu solicitud de ingreso' });
    } catch (err) {
        // Captura de errores del servidor
        res.status(500).json({ detail: err.message });
    }
});

// Ruta POST para cerrar la sesión del usuario
router.post('/logout/', (req, res) => {
    // Confirmamos al cliente que se cerró la sesión (el frontend debe eliminar el token guardado)
    res.json({ detail: 'Sesión cerrada' });
});

// Ruta GET para obtener los datos del perfil del usuario logueado actualmente
router.get('/me/', verificarToken, async (req, res) => {
    try {
        // Buscamos al usuario por el ID del token y excluimos el campo de la contraseña (select '-contraseña')
        const usuarioEncontrado = await Usuario.findById(req.usuario.id).select('-contraseña');
        
        // Devolvemos el perfil del usuario autenticado
        res.json({
            usuario: {
                id: usuarioEncontrado._id,
                usuario: usuarioEncontrado.usuario,
                correo_electronico: usuarioEncontrado.correo_electronico,
                nombre: usuarioEncontrado.nombre,
                apellido: usuarioEncontrado.apellido,
                es_administrador: usuarioEncontrado.es_administrador
            }
        });
    } catch (err) {
        // Captura de errores del servidor
        res.status(500).json({ detail: err.message });
    }
});

// Ruta POST para recuperar o restablecer la contraseña si fue olvidada
router.post('/recuperar/', async (req, res) => {
    try {
        // Extraemos los datos recibidos del formulario
        const { usuario, correo_electronico, nueva_contraseña } = req.body;
        
        // Validamos que se hayan proporcionado todos los campos requeridos
        if (!usuario || !correo_electronico || !nueva_contraseña) {
            return res.status(400).json({ detail: 'Faltan campos obligatorios' });
        }
        
        // Comprobamos que el nombre de usuario coincida con el correo electrónico registrado
        const usuarioEncontrado = await Usuario.findOne({ usuario, correo_electronico });
        if (!usuarioEncontrado) {
            return res.status(400).json({ detail: 'El usuario o el correo no coinciden' });
        }
        
        // Encriptamos la nueva contraseña recibida
        const hash = await bcypy.hash(nueva_contraseña, 10);
        
        // Actualizamos el campo de la contraseña con la nueva versión encriptada
        usuarioEncontrado.contraseña = hash;
        
        // Guardamos los cambios en la base de datos
        await usuarioEncontrado.save();
        
        // Respondemos con éxito la actualización de contraseña
        res.json({ detail: 'Contraseña actualizada correctamente' });
    } catch (err) {
        // Captura de errores del servidor
        res.status(500).json({ detail: err.message });
    }
});

// Ruta POST para cambiar la contraseña cuando el usuario ya inició sesión
router.post('/cambiar-clave/', verificarToken, async (req, res) => {
    try {
        // Obtenemos la contraseña actual y la nueva ingresada por el usuario
        const { contraseña_actual, nueva_contraseña } = req.body;
        
        // Verificamos que ambos campos hayan sido completados
        if (!contraseña_actual || !nueva_contraseña) {
            return res.status(400).json({ detail: 'Faltan campos obligatorios' });
        }
        
        // Buscamos la información actual del usuario conectado a partir de su ID
        const usuarioEncontrado = await Usuario.findById(req.usuario.id);
        
        // Verificamos que la contraseña actual proporcionada coincida con la de la BD
        const claveValida = await bcypy.compare(contraseña_actual, usuarioEncontrado.contraseña);
        if (!claveValida) {
            return res.status(400).json({ detail: 'La contraseña actual es incorrecta' });
        }
        
        // Encriptamos la nueva contraseña introducida
        const hash = await bcypy.hash(nueva_contraseña, 10);
        
        // Reemplazamos la clave guardada por la nueva clave encriptada
        usuarioEncontrado.contraseña = hash;
        
        // Guardamos los cambios actualizados en la base de datos
        await usuarioEncontrado.save();
        
        // Respondemos confirmando el cambio correcto de clave
        res.json({ detail: 'Contraseña cambiada correctamente' });
    } catch (err) {
        // Captura de errores del servidor
        res.status(500).json({ detail: err.message });
    }
});

// Exportamos el router para usarlo en el archivo principal de la aplicación
module.exports = router;

// Exportamos la función de verificación de token para usarla en otros archivos de rutas
module.exports.verificarToken = verificarToken;

// Exportamos la función de verificación de administrador por si se necesita en otros controladores
module.exports.verificarAdmin = verificarAdmin;