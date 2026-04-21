import { useEffect } from 'react';
import AppRouter from './routes/AppRouter';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LicenseProvider } from './context/LicenseContext';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LicenseProvider>
          <AppRouter />
        </LicenseProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
