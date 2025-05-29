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

    const numericFields = Object.entries(requiredFields);
    for (const [field, value] of numericFields) {
      if (isNaN(parseFloat(value))) {
        return res.status(400).json({ 
          error: `Invalid numeric value for field: ${field}` 
        });
      }
    }

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

  if (filters.startDate) {
    query += ' AND DATE(time) >= DATE(?)';
    queryParams.push(filters.startDate);
  }
  if (filters.endDate) {
    query += ' AND DATE(time) <= DATE(?)';
    queryParams.push(filters.endDate);
  }

  query += ' ORDER BY time DESC LIMIT 1000';  // Limit to 1000 most recent records

  console.log('Executing query:', query);
  console.log('Query parameters:', queryParams);

  connection.query(query, queryParams, (err, records) => {
    if (err) {
      console.error('Error applying filters:', err);
      res.status(500).json({ error: 'Database error: ' + err.message });
      return;
    }

    try {
      const fields = ['temperature_air', 'temperature_ground', 'wind', 'pressure', 'humidity', 'gaz'];
      const statistics = {};

      fields.forEach(field => {
        statistics[field] = {
          max: null,
          min: null,
          mean: null
        };

        let max = -Infinity;
        let min = Infinity;
        let sum = 0;
        let count = 0;

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

    let csv = '';
    
    csv += Object.keys(results[0]).join(',') + '\n';
    
    results.forEach(row => {
      const values = Object.values(row).map(value => {
        if (value instanceof Date) {
          return value.toISOString().slice(0, 19).replace('T', ' ');
        }
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
      });
      csv += values.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    res.send(csv);
  });
});

app.post('/forecast/smoothing', (req, res) => {
  console.log('Received forecast request:', req.body);
  
  const { days = 7, dataType = 'temperature_air' } = req.body;
  
  if (!days || days < 1 || days > 30) {
    return res.status(400).json({ error: 'Days must be between 1 and 30' });
  }

  const validDataTypes = ['temperature_air', 'temperature_ground', 'wind', 'pressure', 'humidity', 'gaz'];
  if (!validDataTypes.includes(dataType)) {
    return res.status(400).json({ error: 'Invalid data type' });
  }
  
  const currentDate = new Date();
  const sevenDaysAgo = new Date(currentDate);
  sevenDaysAgo.setDate(currentDate.getDate() - 7);

  const query = `
    SELECT time, ${dataType} 
    FROM data 
    WHERE ${dataType} IS NOT NULL 
      AND time BETWEEN ? AND ?
    ORDER BY time ASC
  `;
  
  connection.query(query, [
    sevenDaysAgo.toISOString().slice(0, 19).replace('T', ' '),
    currentDate.toISOString().slice(0, 19).replace('T', ' ')
  ], (err, results) => {
    if (err) {
      console.error('Error fetching data for forecast:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'No historical data available' });
    }

    console.log('Retrieved historical points:', results.length);
    console.log('Date range:', {
      from: sevenDaysAgo.toISOString(),
      to: currentDate.toISOString()
    });

    const historical = results.map(r => ({
      time: new Date(r.time).toISOString().slice(0, 19).replace('T', ' '),
      value: parseFloat(r[dataType])
    }));

    const windowSize = Math.min(5, Math.floor(results.length / 4));
    const smoothedData = [];
    
    for (let i = 0; i < results.length - windowSize + 1; i++) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        sum += parseFloat(results[i + j][dataType]);
      }
      const average = sum / windowSize;
      smoothedData.push({
        time: new Date(results[i + windowSize - 1].time).toISOString().slice(0, 19).replace('T', ' '),
        value: parseFloat(average.toFixed(2))
      });
    }

    const recentPoints = smoothedData.slice(-10);
    let weightedChange = 0;
    let weightSum = 0;
    
    for (let i = 1; i < recentPoints.length; i++) {
      const weight = i;
      const change = recentPoints[i].value - recentPoints[i-1].value;
      weightedChange += change * weight;
      weightSum += weight;
    }
    
    const averageChange = weightSum !== 0 ? weightedChange / weightSum : 0;

    const forecast = [];
    let lastValue = smoothedData[smoothedData.length - 1].value;
    let lastDate = new Date(smoothedData[smoothedData.length - 1].time);
    const dampeningFactor = 0.95;

    lastDate = new Date(lastDate);
    lastDate.setDate(lastDate.getDate() + 1);
    lastDate.setHours(0, 0, 0, 0); // Set to beginning of the day (00:00:00)

    for (let i = 0; i < days; i++) {
      const trend = averageChange * Math.pow(dampeningFactor, i);
      lastValue += trend;
      
      forecast.push({
        time: lastDate.toISOString().slice(0, 19).replace('T', ' '),
        value: parseFloat(lastValue.toFixed(2))
      });

      lastDate = new Date(lastDate);
      lastDate.setDate(lastDate.getDate() + 1);
    }

    console.log('Historical data range:', {
      start: historical[0].time,
      end: historical[historical.length - 1].time,
      points: historical.length
    });
    console.log('Forecast range:', {
      start: forecast[0].time,
      end: forecast[forecast.length - 1].time,
      points: forecast.length
    });

    res.json({
      historical: historical,
      forecast: forecast
    });
  });
});

app.post('/forecast/kalman', (req, res) => {
  console.log('Received Kalman forecast request:', req.body);
  
  const { days = 7, dataType = 'temperature_air' } = req.body;
  
  if (!days || days < 1 || days > 30) {
    return res.status(400).json({ error: 'Days must be between 1 and 30' });
  }

  const validDataTypes = ['temperature_air', 'temperature_ground', 'wind', 'pressure', 'humidity', 'gaz'];
  if (!validDataTypes.includes(dataType)) {
    return res.status(400).json({ error: 'Invalid data type' });
  }
  
  const currentDate = new Date();
  const sevenDaysAgo = new Date(currentDate);
  sevenDaysAgo.setDate(currentDate.getDate() - 7);

  const query = `
    SELECT time, ${dataType} 
    FROM data 
    WHERE ${dataType} IS NOT NULL 
      AND time BETWEEN ? AND ?
    ORDER BY time ASC
  `;
  
  connection.query(query, [
    sevenDaysAgo.toISOString().slice(0, 19).replace('T', ' '),
    currentDate.toISOString().slice(0, 19).replace('T', ' ')
  ], (err, results) => {
    if (err) {
      console.error('Error fetching data for Kalman forecast:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'No historical data available' });
    }

    try {
      const historical = results.map(r => ({
        time: new Date(r.time).toISOString().slice(0, 19).replace('T', ' '),
        value: parseFloat(r[dataType])
      })).filter(d => !isNaN(d.value) && isFinite(d.value));

      if (historical.length === 0) {
        return res.status(404).json({ error: 'No valid historical data available after filtering' });
      }

      let x = historical[0].value; // State estimate
      let P = 0.1; // Lower initial uncertainty
      const Q = 0.01; // Small process noise to allow for natural temperature changes
      const R = 1.0; // Higher measurement noise to reduce over-reaction to outliers

      const filteredData = [];
      let prevValue = x;
      let velocity = 0;

      for (let i = 0; i < historical.length; i++) {
        const measurement = historical[i].value;
        
        if (i > 0) {
          velocity = measurement - prevValue;
        }

        const x_pred = x + velocity * 0.1; // Reduce the impact of velocity
        const P_pred = P + Q;

        const K = P_pred / (P_pred + R); // Kalman gain
        x = x_pred + K * (measurement - x_pred);
        P = (1 - K) * P_pred;

        filteredData.push({
          time: historical[i].time,
          value: parseFloat((0.9 * measurement + 0.1 * x).toFixed(2)) // Blend actual and filtered values
        });

        prevValue = measurement; // Use actual measurement for velocity calculation
      }

      const forecast = [];
      let lastDate = new Date(historical[historical.length - 1].time);
      let lastValue = filteredData[filteredData.length - 1].value;

      lastDate = new Date(lastDate);
      lastDate.setDate(lastDate.getDate() + 1);
      lastDate.setHours(0, 0, 0, 0);

      const dailyPatterns = [];
      for (let i = 1; i < historical.length; i++) {
        const timeDiff = (new Date(historical[i].time) - new Date(historical[i-1].time)) / (1000 * 60 * 60 * 24);
        if (timeDiff > 0) {
          dailyPatterns.push((historical[i].value - historical[i-1].value) / timeDiff);
        }
      }

      const sortedPatterns = [...dailyPatterns].sort((a, b) => a - b);
      const medianChange = sortedPatterns[Math.floor(sortedPatterns.length / 2)] || 0;

      const dampeningFactor = 0.95;
      for (let i = 0; i < days; i++) {
        const baseChange = medianChange * Math.pow(dampeningFactor, i);
        const randomFactor = 0.05; // Reduce random variation
        const variation = (Math.random() - 0.5) * Math.abs(medianChange) * randomFactor;
        
        lastValue += baseChange + variation;

        const maxChange = 5; // Maximum allowed daily temperature change
        const originalLastValue = filteredData[filteredData.length - 1].value;
        if (Math.abs(lastValue - originalLastValue) > maxChange * (i + 1)) {
          lastValue = originalLastValue + (Math.sign(lastValue - originalLastValue) * maxChange * (i + 1));
        }

        forecast.push({
          time: lastDate.toISOString().slice(0, 19).replace('T', ' '),
          value: parseFloat(lastValue.toFixed(2))
        });

        // Move to next day
        lastDate = new Date(lastDate);
        lastDate.setDate(lastDate.getDate() + 1);
      }

      res.json({
        historical: historical, // Return original historical data instead of filtered
        forecast: forecast
      });
    } catch (error) {
      console.error('Error processing forecast:', error);
      res.status(500).json({ error: 'Error processing forecast: ' + error.message });
    }
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));