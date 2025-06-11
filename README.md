# 📘 Weather Monitor

> Веб-застосунок для збору і візуалізації даних про погоду

---

## 👤 Автор

- **ПІБ**: Стасів Петро
- **Група**: ФЕІ-41
- **Керівник**: Рабик Василь, кандидат технічних наук, доцент
- **Дата виконання**: 10.05.2025

---

## 📌 Загальна інформація

- **Тип проєкту**: Вебсайт
- **Мова програмування**: JavaScript, Node.js
- **Фреймворки / Бібліотеки**: Express, Axios, Mysql2

---

## 🧠 Опис функціоналу

- 📊 Візуалізація метео даних
- 📈 Прогнозування метео даних
- 💾 Збереження даних у базу даних MySQL
- 🖥️ Збереження за бажанням користувача даних на комп'ютер
- 🌐 REST API для взаємодії між frontend та backend
- 📱 Інтерфейс з кнопками для роботи з даними
- 📝 Можливість добавляти в ручну дані до БД

---

## 🧱 Опис основних класів / файлів

| Клас / Файл     | Призначення |
|----------------|-------------|
| `index.js`    | Node.js сервер, який обробляє всі запити |
| `public/index.html` | Frontend частина сайту |

---

## ▶️ Як запустити проєкт "з нуля"

### 1. Альтернативний спосіб
 
 - Перейти за посиланням http://weathermonitor.online/

### 2. Встановлення інструментів

- Node.js v22.16.0 + npm v11.4.1

### 3. Клонування репозиторію

```bash
git clone https://github.com/ptr-stasiv/WeatherMonitor.git
cd WeatherMonitor
```

### 4. Встановлення залежностей

```bash
# Backend
npm install

### 5. Запуск

```bash
# Backend
node index.js
```

---

## 🔌 API приклади

### Отримання 100 останніх записів з БД

**GET /data**

**Response:**

```json
[
  {
    "time": "2024-03-20 10:00:00",
    "temperature_air": 20.5,
    "temperature_ground": 19.8,
    "wind": 3.2,
    "pressure": 1013,
    "humidity": 65,
    "gaz": 450
  }
  ...
]
```

### Отримання останнього запису з БД

**GET /lastData**

**Response:**

```json
{
  "time": "2024-03-20 10:00:00",
  "temperature_air": 20.5,
  "temperature_ground": 19.8,
  "wind": 3.2,
  "pressure": 1013,
  "humidity": 65,
  "gaz": 450
}
```

### Добавлення даних в БД

**POST /addRecord**

**Request:**

```json
{
  "temperature_air": 20.5,
  "temperature_ground": 19.8,
  "wind": 3.2,
  "pressure": 1013,
  "humidity": 65,
  "gaz": 450,
  "time": "2024-03-20 10:00:00"
}
```

**Response:**

```json
{
  "temperature_air": 20.5,
  "temperature_ground": 19.8,
  "wind": 3.2,
  "pressure": 1013,
  "humidity": 65,
  "gaz": 450,
  "time": "2024-03-20 10:00:00"
}
```

### Отримання фільтрованих даних

**POST /applyFilters**

**Request:**

```json
{
  "startDate": "2024-03-19",
  "endDate": "2024-03-20",
  "showMax": true,
  "showMin": true,
  "showMean": true
}
```

**Response:**

```json
{
  "records": [...],
  "statistics": {
    "temperature_air": {
      "max": 25.5,
      "min": 15.2,
      "mean": 20.1
    },
  }
}
```

### Отримання даних прогнозу Холта-Вінтерса

**POST /forecast/smoothing**

**Request:**

```json
{
  "hours": 24,
  "dataType": "temperature_air"
}
```

**Response:**

```json
{
  "historical": [
    {
      "time": "2024-03-19 10:00:00",
      "value": 20.5
    }
  ],
  "forecast": [
    {
      "time": "2024-03-20 10:00:00",
      "value": 21.2
    }
  ]
}
```

### Отримання даних прогнозу Калмана

**POST /forecast/kalman**

**Request:**

```json
{
  "hours": 24,
  "dataType": "temperature_air"
}
```

**Response:**

```json
{
  "historical": [
    {
      "time": "2024-03-19 10:00:00",
      "value": 20.5
    }
  ],
  "forecast": [
    {
      "time": "2024-03-20 10:00:00",
      "value": 21.2
    }
  ]
}
```

### Отримання даних для завантаження

**POST /forecast/getData**

**Request:**

```json
{
  "dataType": "temperature_air",
  "startDate": "2024-03-19",
  "endDate": "2024-03-20"
}
```

**Response:**

```json
[
  {
    "time": "2024-03-19 10:00:00",
    "temperature_air": 20.5,
    "temperature_ground": 19.8,
    "wind": 3.2,
    "pressure": 1013,
    "humidity": 65,
    "gaz": 450
  }
  ...
]
```

---

## 🖱️ Інструкція для користувача

1. **Головна сторінка**:
   - ` Select City` - для вибору міста для якого будуть виведені записані дані
   - ` File->Edit` — запис нових даних в БД
   - ` File->Download` — для завантаження даних з БД
   - ` View->Filters` — для відображення відфільтрованих даних
   - ` View->Graphs` — для відображення даних у вигляді графів
   - ` Forecast->Kalman Filter` — для прогнозування даних фільтром Калмана
   - ` Forecast->Smoothing Method` — для прогнозування даних методом Холта-Вінтерса
   - ` Help->About` — для виведення загальної інформації про програму
---

## 📷 Приклади / скриншоти

- Головна сторінка
- Меню графіків
- Меню фільтра
- Меню прогнозування
---

## 🧾 Використані джерела / література

- Node.js офіційна документація
- Javascript MDN web docs
- EC2 офіційна документація
- StackOverflow