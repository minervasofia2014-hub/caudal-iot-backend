//Aca se cargan las varibales de entorno desde el archvo .env por ejemplo: PORT, MONGODB_URI, FRONTEND_URL
require('dotenv').config();
//Se importa la librería Express para crear el servidor y poder manejar las rutas
const express = require('express');
//Se importa el Mongoose para podernos conectar y trabajar con la base de datos de MongoDB
const mongoose = require('mongoose');
//También se importa la librería Cors que nos permite las peticiones desde otros dominico 
//por ejemplo desde el frontend en otro servidor
const cors = require('cors');
//Aca se importa la funcion en la cual se va a iniciar la ingesta de datos de MQTT son las lecturas de los sensores
const { iniciarIngesta } = require('./mqtt/ingest');
//Aca se crea la aplicación Express
const app = express();

//Aca se configura las opciones de Cors
//Si exite la variable FRONTEND_URL, solo se va a permitir desde ese origen
//Si no existe, las  vat¿riables quedaran vaciás eso se deja por defecto
const opcionesCors = process.env.FRONTEND_URL
    ?{ origin: process.env.FRONTEND_URL }
    :{};

//Aca se activa CORS en la aplicación pero con las opciones definidas
app.use(cors(opcionesCors));
//Aca seactiva el middleaware para que Express pueda interprar el jSON de las peticiones
app.use(express.json());

//Aca es donde se conecta el MongoDB utilizando el URL de definida de las variables de entorno como es el MONGODB_URI
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        //Si la conexion es exitosa, se mostrara el mensaje de conectado
        console.log('MongoDB conectado');
        //Aca se inicia la ingesta de datos desde el MQTT (sensores enviando las lecturas)
        iniciarIngesta();
    })
    //Si falla la conexión se mostrara el error 
    .catch(err => console.log('Error conectando a MongoDB:', err));
    
//Aca se crea una de las rutas más simples para que se pueda verificar que el servidor está vivo
app.get('/health', (req, res) => res.json({ status: 'ok' }));
//Aca se definen las rutas principales de la API
//Esta ruta es de autenticación que es el login y el registro, etc
app.use('/api/auth', require('./routes/auth'));
//Esta ruta es la gestión de los usuarios
app.use('/api/usuarios', require('./routes/usuarios'));
//Esta ruta es de las mediciones de los sensores
app.use('/api/mediciones', require('./routes/mediciones'));
//Esta ruta es para el dashboard que son las estadísticas y el estado de l sistema 
app.use('/api/v1', require('./routes/dashboard'));

//Aca se define en que puerto se correra el servidor 
//Si existe la variable PORT, usamos esa. Sino usamos el puerto 8000 por defecto
const PUERTO =process.env.PORT || 8000;
app.listen(PUERTO, () => {
    //Aca se mostrara el mensaje en cosola confirmando que el servidor está corriendo y en que puerto 
    console.log(`Servidor corriendo en el puerto ${PUERTO}`);
});