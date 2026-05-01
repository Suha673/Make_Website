# Lumina Beauty Studio Website

Responsive makeup and beauty salon website with a simple Node.js backend.

## Run the Website

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Owner Dashboard

```text
http://localhost:3000/admin.html
```

The dashboard displays booking requests and feedback submitted from the website.

## Backend Features

- `POST /api/bookings` saves appointment requests.
- `GET /api/bookings` returns saved bookings for the dashboard.
- `POST /api/feedback` saves user feedback.
- `GET /api/feedback` returns saved feedback for the dashboard.
- `POST /api/auth` creates a new account or logs in an existing user.

Data is stored locally in the `data` folder as JSON files.
