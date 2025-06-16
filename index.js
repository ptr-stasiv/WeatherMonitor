const express = require('express');
const axios = require('axios');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = 80;

// Add JSON body parsing middleware
app.use(express.json());

// Add middleware to parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));

const API_KEY = '3cd323f0dc2bba188fdc43f1b16365ff';
const CITY = 'Lviv';
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

setInterval(fetchWeatherData, 300000);

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
  
  const { hours = 24, dataType = 'temperature_air' } = req.body;
  
  if (!hours || hours < 1 || hours > 168) { // Max 7 days (168 hours)
    return res.status(400).json({ error: 'Hours must be between 1 and 168' });
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

    // Analyze daily patterns
    const hourlyPatterns = new Array(24).fill(0).map(() => []);
    for (let i = 0; i < historical.length; i++) {
      const hour = new Date(historical[i].time).getHours();
      hourlyPatterns[hour].push(historical[i].value);
    }

    // Calculate hourly averages and variations
    const hourlyStats = hourlyPatterns.map(values => {
      if (values.length === 0) return { avg: null, std: 0 };
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length);
      return { avg, std };
    });

    // Calculate recent trend
    const recentPoints = historical.slice(-24); // Use last 24 hours for trend
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
    let lastValue = historical[historical.length - 1].value;
    let lastDate = new Date(historical[historical.length - 1].time);
    const dampeningFactor = 0.95; // Slightly stronger dampening

    if (historical.length > 0) {
      // Додаємо першу точку forecast як точну копію останньої historical
      forecast.length = 0;
      forecast.push({
        time: historical[historical.length - 1].time,
        value: historical[historical.length - 1].value
      });
      let lastDate = new Date(historical[historical.length - 1].time);
      let lastValue = historical[historical.length - 1].value;
      // Далі прогноз з кроком у годину
      for (let i = 0; i < hours; i++) {
        lastDate.setHours(lastDate.getHours() + 1);
        const currentHour = lastDate.getHours();
        const currentHourStat = hourlyStats[currentHour];
        let hourlyAdjustment = 0;
        if (currentHourStat && currentHourStat.avg !== null) {
          const typicalValue = currentHourStat.avg;
          const currentDeviation = lastValue - typicalValue;
          hourlyAdjustment = -currentDeviation * 0.2;
        }
        const trend = averageChange * Math.pow(dampeningFactor, i);
        lastValue += trend + hourlyAdjustment;
        const nextTime = lastDate.toISOString().slice(0, 19).replace('T', ' ');
        // Додаємо тільки якщо час більший за першу точку forecast
        if (new Date(nextTime) > new Date(forecast[0].time)) {
          forecast.push({
            time: nextTime,
            value: parseFloat(lastValue.toFixed(2))
          });
        }
      }
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
  
  const { hours = 24, dataType = 'temperature_air' } = req.body;
  
  if (!hours || hours < 1 || hours > 168) {
    return res.status(400).json({ error: 'Hours must be between 1 and 168' });
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

      // Analyze hourly patterns
      const hourlyPatterns = new Array(24).fill(0).map(() => []);
      for (let i = 0; i < historical.length; i++) {
        const hour = new Date(historical[i].time).getHours();
        hourlyPatterns[hour].push(historical[i].value);
      }

      // Calculate hourly statistics
      const hourlyStats = hourlyPatterns.map(values => {
        if (values.length === 0) return { avg: null, std: 0 };
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length);
        return { avg, std };
      });

      // Initialize Kalman filter with better initial state
      const initialHour = new Date(historical[0].time).getHours();
      const hourStat = hourlyStats[initialHour];
      let x = hourStat && hourStat.avg !== null ? hourStat.avg : historical[0].value; // State estimate
      let P = 0.1; // Initial uncertainty
      const Q = 0.01; // Process noise
      const R = 1.0; // Measurement noise

      const filteredData = [];
      let prevValue = x;
      let velocity = 0;
      let prevHour = initialHour;

      // Enhanced Kalman filter with hourly pattern consideration
      for (let i = 0; i < historical.length; i++) {
        const measurement = historical[i].value;
        const currentHour = new Date(historical[i].time).getHours();
        
        // Calculate velocity considering hourly patterns
        if (i > 0) {
          const hourDiff = (currentHour - prevHour + 24) % 24;
          const expectedChange = hourDiff > 0 ? 
            (hourlyStats[currentHour].avg - hourlyStats[prevHour].avg) / hourDiff : 0;
          velocity = 0.7 * (measurement - prevValue) + 0.3 * expectedChange;
        }

        // Prediction step with hourly pattern adjustment
        const hourStat = hourlyStats[currentHour];
        let x_pred = x + velocity * 0.1; // Base prediction
        
        if (hourStat && hourStat.avg !== null) {
          // Blend prediction with typical value for this hour
          x_pred = 0.8 * x_pred + 0.2 * hourStat.avg;
        }

        const P_pred = P + Q;

        // Update step
        const K = P_pred / (P_pred + R);
        x = x_pred + K * (measurement - x_pred);
        P = (1 - K) * P_pred;

        filteredData.push({
          time: historical[i].time,
          value: parseFloat((0.9 * measurement + 0.1 * x).toFixed(2))
        });

        prevValue = measurement;
        prevHour = currentHour;
      }

      // Get the last historical record time and value
      const lastHistoricalRecord = historical[historical.length - 1];
      const lastHistoricalTime = new Date(lastHistoricalRecord.time);
      const lastHistoricalValue = lastHistoricalRecord.value;

      // Start forecasting from the next hour
      const forecast = [];
      let lastDate = new Date(lastHistoricalTime);
      let lastValue = filteredData[filteredData.length - 1].value;

      // Calculate hourly changes for better trend estimation
      const hourlyChanges = new Array(24).fill(0).map(() => []);
      for (let i = 1; i < historical.length; i++) {
        const prevTime = new Date(historical[i-1].time);
        const currTime = new Date(historical[i].time);
        const hourDiff = (currTime - prevTime) / (1000 * 60 * 60);
        if (hourDiff > 0 && hourDiff <= 1) {
          const hour = prevTime.getHours();
          hourlyChanges[hour].push((historical[i].value - historical[i-1].value) / hourDiff);
        }
      }
      // Calculate median changes for each hour
      const hourlyMedianChanges = hourlyChanges.map(changes => {
        if (changes.length === 0) return 0;
        const sorted = [...changes].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      });
      const dampeningFactor = 0.95;
      if (historical.length > 0) {
        // Додаємо першу точку forecast як точну копію останньої historical
        forecast.length = 0;
        forecast.push({
          time: historical[historical.length - 1].time,
          value: historical[historical.length - 1].value
        });
        let lastDate = new Date(historical[historical.length - 1].time);
        let lastValue = historical[historical.length - 1].value;
        // Далі прогноз з кроком у годину
        for (let i = 0; i < hours; i++) {
          lastDate.setHours(lastDate.getHours() + 1);
          const currentHour = lastDate.getHours();
          const hourStat = hourlyStats[currentHour];
          const medianChange = hourlyMedianChanges[currentHour];
          let change = medianChange * Math.pow(dampeningFactor, i);
          if (hourStat && hourStat.avg !== null) {
            const deviation = lastValue - hourStat.avg;
            change -= deviation * 0.2;
          }
          const std = hourStat ? hourStat.std : 1;
          const variation = (Math.random() - 0.5) * std * 0.1;
          lastValue += change + variation;
          const maxChange = Math.max(5, std * 2);
          if (Math.abs(lastValue - historical[historical.length - 1].value) > maxChange * (i + 1)) {
            lastValue = historical[historical.length - 1].value + (Math.sign(lastValue - historical[historical.length - 1].value) * maxChange * (i + 1));
          }
          const nextTime = lastDate.toISOString().slice(0, 19).replace('T', ' ');
          // Додаємо тільки якщо час більший за першу точку forecast
          if (new Date(nextTime) > new Date(forecast[0].time)) {
            forecast.push({
              time: nextTime,
              value: parseFloat(lastValue.toFixed(2))
            });
          }
        }
      }

      res.json({
        historical: historical,
        forecast: forecast
      });
    } catch (error) {
      console.error('Error processing forecast:', error);
      res.status(500).json({ error: 'Error processing forecast: ' + error.message });
    }
  });
});

app.post('/receiveData', (req, res) => {
  console.log('Data received at:', new Date().toISOString());
  
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Raw request body:', req.body);
  
  const data = req.body;
  console.log('Processed data:', JSON.stringify(data, null, 2));
  
  res.json({
    status: 'success',
    message: 'Data received successfully',
    timestamp: new Date().toISOString(),
    receivedData: data
  });
});

app.post('/getData', (req, res) => {
  const { dataType, startDate, endDate } = req.body;
  console.log('Received request:', { dataType, startDate, endDate });

  // Validate input parameters
  if (!dataType) {
    return res.status(400).json({ error: 'Data type is required' });
  }

  // List of valid data types
  const validDataTypes = ['temperature_air', 'temperature_ground', 'wind', 'pressure', 'humidity', 'gaz'];
  if (!validDataTypes.includes(dataType)) {
    return res.status(400).json({ error: 'Invalid data type' });
  }

  // Build the query - fetch all columns like the filters endpoint
  let query = 'SELECT time, temperature_air, temperature_ground, wind, pressure, humidity, gaz FROM data WHERE 1=1';
  const queryParams = [];

  if (startDate) {
    query += ' AND time >= ?';
    queryParams.push(startDate);
  }
  if (endDate) {
    query += ' AND time <= ?';
    queryParams.push(endDate);
  }

  // Order by time and limit to prevent overwhelming the client
  query += ' ORDER BY time ASC';

  console.log('Executing query:', query);
  console.log('Query parameters:', queryParams);

  // Execute the query
  connection.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('Error fetching graph data:', err);
      res.status(500).json({ error: 'Database error: ' + err.message });
      return;
    }

    try {
      console.log(`Retrieved ${results.length} records`);
      // Send the full results
      res.json(results);
    } catch (error) {
      console.error('Error formatting results:', error);
      res.status(500).json({ error: 'Error formatting data: ' + error.message });
    }
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));