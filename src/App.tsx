import { useGame } from './state/store';
import { BottomNav } from './app/navigation/BottomNav';
import { GarageScreen } from './app/screens/GarageScreen';
import { BuilderScreen } from './app/screens/BuilderScreen';
import { TestScreen } from './app/screens/TestScreen';
import { LabScreen } from './app/screens/LabScreen';
import './app/app.css';

export function App() {
  const screen = useGame((s) => s.screen);

  return (
    <div className="app-frame">
      <main className="app-main">
        {screen === 'garage' && <GarageScreen />}
        {screen === 'builder' && <BuilderScreen />}
        {screen === 'test' && <TestScreen />}
        {screen === 'lab' && <LabScreen />}
      </main>
      <BottomNav />
    </div>
  );
}
