# TIZIMI

## Project Overview

TIZIMI is a web application designed to help manage and organize teaching sessions efficiently. It provides an interactive schedule grid with drag-and-drop capabilities, filtering options, and real-time updates to streamline session planning.

## Features

- Dynamic schedule grid displaying sessions by day and time slot.
- Filter sessions by Formateur , Groupe , and Salle .
- Drag and drop sessions to reschedule.
- Conflict detection when moving sessions.
- Room selection modal for resolving conflicts.
- Real-time filtering and refreshing of schedule data.
- Responsive design for desktop and mobile devices.

## Technologies Used

- React with TypeScript
- Vite for build tooling
- React DnD for drag-and-drop functionality
- Tailwind CSS for styling
- shadcn-ui component library
- React Query for data fetching and caching

## Getting Started

### Prerequisites

- Node.js and npm installed (recommend using [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))

### Installation

1. Clone the repository:

```bash
git clone <YOUR_GIT_URL>
```

2. Navigate to the project directory:

```bash
cd <YOUR_PROJECT_NAME>
```

3. Install dependencies:

```bash
npm install
```

4. Start the development server:

```bash
npm run dev
```

5. Open your browser and visit `http://localhost:3000` to view the app.

## Usage

- Use the filter bar at the top to select Formateur, Groupe, or Salle to filter sessions.
- Drag sessions within the schedule grid to reschedule.
- If conflicts arise, use the room selector modal to resolve them.
- Click the refresh button to reload the latest schedule data.

## Testing

- The application has been tested for:
  - Filter functionality: selecting and clearing filters updates the schedule grid correctly.
  - Drag and drop session rescheduling with conflict detection.
  - Room selection modal behavior.
  - Data refresh functionality.
  - Responsive UI behavior.

## Deployment

- The project can be deployed using any static site hosting service.
- For production builds, run:

```bash
npm run build
```

- Serve the `dist` directory with your preferred static server.

## Contributing

Contributions are welcome! Please fork the repository and submit pull requests.

## License

This project is licensed under the MIT License.

## Contact

For questions or support, please contact the project maintainer.

pour lancer backend :
cd backend
flask --app app run