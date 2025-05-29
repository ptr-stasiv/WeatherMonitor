const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = 3000;

// Add JSON body parsing middleware
app.use(express.json());

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
    const pressure = data.main.pressure;
    // Simulate gas reading (random value between 400-1000 ppm CO2)
    const gasLevel = Math.floor(Math.random() * (1000 - 400 + 1)) + 400;
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

    const query = `INSERT INTO data (time, temperature_air, temperature_ground, humidity, wind, pressure, gaz) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    connection.query(query, [timestamp, temperature, temperature, humidity, windSpeed, pressure, gasLevel], (err) => {
      if (err) console.error('Error inserting data into MySQL:', err.message);
    });
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
  }
};

setInterval(fetchWeatherData, 50000);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/data', (req, res) => {
  connection.query('SELECT time, temperature_air, temperature_ground, wind, pressure, humidity, gaz FROM data ORDER BY time DESC LIMIT 100', (err, results) => {
    if (err) {
      console.error('Error fetching data:', err.message);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(results);
    }
  });
});

app.get('/lastData', (req, res) => {
  connection.query('SELECT time, temperature_air, temperature_ground, wind, pressure, humidity, gaz FROM data ORDER BY time DESC LIMIT 1', (err, results) => {
    if (err) {
      console.error('Error fetching data:', err.message);
      res.status(500).json({ error: 'Database error' });
    } else {
      res.json(results[0]);
    }
  });
});

// Add new endpoint for adding records
app.post('/addRecord', async (req, res) => {
  try {
    const {
      temperature_air,
      temperature_ground,
      wind,
      pressure,
      humidity,
      gaz,
      time
    } = req.body;

    // Validate input
    const requiredFields = {
      temperature_air,
      temperature_ground,
      wind,
      pressure,
      humidity,
      gaz
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => value === undefined || value === null || value === '')
      .map(([field]) => field);

    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        missingFields 
      });
    }

    // Validate numeric values
    const numericFields = Object.entries(requiredFields);
    for (const [field, value] of numericFields) {
      if (isNaN(parseFloat(value))) {
        return res.status(400).json({ 
          error: `Invalid numeric value for field: ${field}` 
        });
      }
    }

    // Use current timestamp if time is not provided
    const timestamp = time || new Date().toISOString().slice(0, 19).replace("T", " ");

    const query = `
      INSERT INTO data (
        time,
        temperature_air,
        temperature_ground,
        wind,
        pressure,
        humidity,
        gaz
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(
      query,
      [timestamp, temperature_air, temperature_ground, wind, pressure, humidity, gaz],
      (err, results) => {
        if (err) {
          console.error('Error inserting data:', err.message);
          return res.status(500).json({ 
            error: 'Database error', 
            details: err.message 
          });
        }
        
        res.status(201).json({ 
          message: 'Record added successfully',
          id: results.insertId,
          timestamp
        });
      }
    );
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
});

app.post('/applyFilters', (req, res) => {
  const filters = req.body;
  let query = 'SELECT * FROM data WHERE 1=1';
  const queryParams = [];

  // Add date range filter with proper date formatting
  if (filters.startDate) {
    query += ' AND DATE(time) >= DATE(?)';
    queryParams.push(filters.startDate);
  }
  if (filters.endDate) {
    query += ' AND DATE(time) <= DATE(?)';
    queryParams.push(filters.endDate);
  }

  // Add ORDER BY and LIMIT
  query += ' ORDER BY time DESC LIMIT 1000';  // Limit to 1000 most recent records

  console.log('Executing query:', query);
  console.log('Query parameters:', queryParams);

  // Execute the query
  connection.query(query, queryParams, (err, records) => {
    if (err) {
      console.error('Error applying filters:', err);
      res.status(500).json({ error: 'Database error: ' + err.message });
      return;
    }

    try {
      // Calculate statistics for each field
      const fields = ['temperature_air', 'temperature_ground', 'wind', 'pressure', 'humidity', 'gaz'];
      const statistics = {};

      fields.forEach(field => {
        // Initialize statistics object for this field
        statistics[field] = {
          max: null,
          min: null,
          mean: null
        };

        let max = -Infinity;
        let min = Infinity;
        let sum = 0;
        let count = 0;

        // Single pass through the data
        records.forEach(record => {
          const val = Number(record[field]);
          if (val !== null && !isNaN(val)) {
            if (filters.showMax && val > max) max = val;
            if (filters.showMin && val < min) min = val;
            if (filters.showMean) {
              sum += val;
              count++;
            }
          }
        });

        // Set the calculated values
        if (count > 0) {
          if (filters.showMax) statistics[field].max = max;
          if (filters.showMin) statistics[field].min = min;
          if (filters.showMean) statistics[field].mean = sum / count;
        }
      });

      console.log('Calculated statistics:', statistics);

      res.json({
        records: records,
        statistics: statistics
      });
    } catch (error) {
      console.error('Error calculating statistics:', error);
      res.status(500).json({ error: 'Error calculating statistics: ' + error.message });
    }
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add download endpoints
app.get('/download/:type', (req, res) => {
  const type = req.params.type;
  let query = '';
  let filename = '';

  switch (type) {
    case 'all':
      query = 'SELECT time, temperature_air, temperature_ground, wind, pressure, humidity, gaz FROM data ORDER BY time DESC';
      filename = 'all_weather_data.csv';
      break;
    case 'temperature_air':
      query = 'SELECT time, temperature_air FROM data ORDER BY time DESC';
      filename = 'temperature_air_data.csv';
      break;
    case 'temperature_ground':
      query = 'SELECT time, temperature_ground FROM data ORDER BY time DESC';
      filename = 'temperature_ground_data.csv';
      break;
    case 'wind':
      query = 'SELECT time, wind FROM data ORDER BY time DESC';
      filename = 'wind_speed_data.csv';
      break;
    case 'pressure':
      query = 'SELECT time, pressure FROM data ORDER BY time DESC';
      filename = 'pressure_data.csv';
      break;
    case 'humidity':
      query = 'SELECT time, humidity FROM data ORDER BY time DESC';
      filename = 'humidity_data.csv';
      break;
    case 'gaz':
      query = 'SELECT time, gaz FROM data ORDER BY time DESC';
      filename = 'gas_level_data.csv';
      break;
    default:
      return res.status(400).json({ error: 'Invalid download type' });
  }

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching data for download:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    // Convert results to CSV
    let csv = '';
    
    // Add headers
    csv += Object.keys(results[0]).join(',') + '\n';
    
    // Add data rows
    results.forEach(row => {
      const values = Object.values(row).map(value => {
        // Handle date formatting
        if (value instanceof Date) {
          return value.toISOString().slice(0, 19).replace('T', ' ');
        }
        // Handle other values, escape commas and quotes
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
      });
      csv += values.join(',') + '\n';
    });

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    res.send(csv);
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));