import { useGame, type Screen } from '../../state/store';

interface NavDef {
  key: Screen;
  label: string;
  icon: JSX.Element;
}

const NAV: NavDef[] = [
  {
    key: 'garage',
    label: 'Garage',
    icon: (
      <path d="M3 10.5 12 4l9 6.5M5 9.5V20h14V9.5M9 20v-5h6v5" />
    ),
  },
  {
    key: 'builder',
    label: 'Build',
    icon: (
      <>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3Z" />
      </>
    ),
  },
  {
    key: 'test',
    label: 'Crash',
    icon: (
      <>
        <path d="M3 17h2l1.5-4h11L19 17h2" />
        <circle cx="7.5" cy="17.5" r="1.6" />
        <circle cx="16.5" cy="17.5" r="1.6" />
        <path d="m12 3-1.5 4M15 4l-2 3.5" />
      </>
    ),
  },
  {
    key: 'lab',
    label: 'Lab',
    icon: (
      <>
        <path d="M9 3v6l-5 8a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 17l-5-8V3" />
        <path d="M8 3h8M8 13h8" />
      </>
    ),
  },
  {
    key: 'challenges',
    label: 'Goals',
    icon: (
      <>
        <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
        <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
        <path d="M12 13v4M9 21h6M10 17h4" />
      </>
    ),
  },
];

export function BottomNav() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);

  return (
    <nav className="bottom-nav" aria-label="Primary">
      {NAV.map((item) => (
        <button
          key={item.key}
          className="nav-item"
          data-active={screen === item.key}
          onClick={() => setScreen(item.key)}
          aria-current={screen === item.key ? 'page' : undefined}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            {item.icon}
          </svg>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
