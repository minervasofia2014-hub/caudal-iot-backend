//Conectamos la librería de MQTT, que nos permite enviar y recibir mensajes entre dispositivos
const mqtt = require('mqtt');

//Vamos a usar un solo cliente en MQTT para toda la aplicación web, con eso evitamos abrir varias conexiones al broker 
//innecesariamente con una sola conexión sirve tanto para publicar como para recibir los datos
const servidorMqtt = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com';

const conexionMqtt = mqtt.connect(servidorMqtt, {
    //Creamos un identificador único para este cliente, combinando el nombre del proyecto con un número aleatorio
    //Si la conexion del servidor se pierde , intentará reconectarse cada 3 segundos
    clientId: 'acueducto_veredal' + Math.random().toString(16).slice(2, 10), reconnectPeriod: 3000,
    //Usuario y contraseña del broker privado (HiveMQ Cloud). Con el broker publico anterior no hacian falta,
    //pero con un cluster propio son obligatorios para poder conectarse.
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
});

//Cuando tengamos conexión al broker, nos mostrara un mensaje en la consola
conexionMqtt.on('connect', () => {
    console.log(`[MQTT] Conectado al servidor: ${servidorMqtt}`);
});

//Si la conexion del broker se cae, intentamos reconectarnos automáticamente
conexionMqtt.on('reconnect', () => {
    console.log('[MQTT] Intenteando reconectar....');
});

//Si ocurre un error, se muestra en consola para poderlo depurarlo
conexionMqtt.on('error', (err) => {
    console.error('[MQTT] Error de conexión:', err.message);
});

//Exportamos la conexión de MQTT para usarla en otras partes de la aplicación web
module.exports = conexionMqtt;