const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = 3000;

const API_KEY = '3cd323f0dc2bba188fdc43f1b16365ff';
const CITY = 'London';
const UNIT = 'metric';

const connection = mysql.createConnection({
  host: 'weathermonitor.cdo6aq060kjl.eu-north-1.rds.amazonaws.com',
  user: 'admin',
  password: 'cofc2015',
  database: 'weather'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL database:', err.message);
    return;
  }
  console.log('Connected to MySQL database');
});

const fetchWeatherData = async () => {
  try {
    const response = await axios.get(`http://api.openweathermap.org/data/2.5/weather`, {
      params: {
        q: CITY,
        appid: API_KEY,
        units: UNIT,
      },
    });

    const data = response.data;
    const temperature = data.main.temp;
    const humidity = data.main.humidity;
    const windSpeed = data.wind.speed;
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

    const query = `INSERT INTO data (time, temperature, humidity, wind) VALUES (?, ?, ?, ?)`;
    connection.query(query, [timestamp, temperature, humidity, windSpeed], (err) => {
      if (err) console.error('Error inserting data into MySQL:', err.message);
    });
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
  }
};

setInterval(fetchWeatherData, 5000);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/data', (req, res) => {
  connection.query('SELECT time, temperature, humidity, wind FROM data ORDER BY time ASC', (err, results) => {
    if (err) {
      console.error('Error fetching data:', err.message);
      res.status(500).send('Database error');
    } else {
      res.json(results);
    }
  });
});

app.get('/lastData', (req, res) => {
  connection.query('SELECT time, temperature, humidity, wind FROM data ORDER BY time DESC LIMIT 1', (err, results) => {
    if (err) {
      console.error('Error fetching data:', err.message);
      res.status(500).send('Database error');
    } else {
      res.json(results[0]);
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));