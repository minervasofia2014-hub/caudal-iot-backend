//Se importa la librería Express, está nos permite crear un servidor web y manejar las rutas
const express = require('express');
//Se crea un "router", esto lo que hace es utilizar un mini-servidor dentro de Express para organizar las rutas
const router = express.Router();
//Se importa la función "verificarToken", esto asegura que solo los usuarios autenticados accedan a estas rutas
const { verificarToken} = require('./auth');
//Se importa el modelo de "Medición", esto es importante ya que representa las kecturas de los sensores en la base de datos
const Medicion = require('../modelos/Medicion');

//Aca se define la ruta "GET" principal "/" esto es para obtener las ultimas lecturas de todos los sensores
//Aca solo pueden acceder los usuarios que esten autenticados por el administrador esto s hace con el "verificarToken"
router.get('/', verificarToken, async (req, res) => {
    try {
        //Aca se buscan las lecturas en la base de datos 
        //También se ordenan por fecha de creación descendente (esto quiere decir que las más recientes van primero)
        //Tambien se pone un limite de datos para no recargar la aplicación
        const lecturas = await Medicion.find().sort({ createdAt: -1 }).limit(50);
        //Las lecturas se responden con json
        res.json(lecturas);
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Aca se define la ruta "Get" "/sensor/:id" esto se hace es para obtener las últimas lecturas de un sensor especifico
//":id" este es un párametro dinámico que se representa el identificador de cada sensor
//Tambien esto requiere que el usuario debe estar autenticado
router.get('/sensor/:id', verificarToken, async (req, res) => {
    try {
        //Aca se busca las lecturas en la base de datos y se filtran por cada sensor_id que se recibe en la URL
        //También se ordena por fecha de creación creación descendente (esto quiere decir que las más recientes van primero)
        //Tambien se pone un limite de datos para no recargar la aplicación
        const lecturas = await Medicion.find({ sensor_id: req.params.id }).sort({ createdAt: -1 }).limit(50);
         //Las lecturas se responden con json
        res.json(lecturas);
    } catch (err) {
        //Si ocurre un error se devolvera un mensaje con el detalle del error 
        res.status(500).json({ detail: err.message });
    }
});

//Se exporta el router con el fin de que se pueda seguir usando en el resto de aplicación
module.exports = router;