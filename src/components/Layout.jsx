import { Outlet, NavLink } from 'react-router-dom';
import BrandMark from '@/components/BrandMark';

const NAV = [
  { label: 'Overview', path: '/' },
  { label: 'Exposure profile', path: '/profile' },
  { label: 'Scan', path: '/scan' },
  { label: 'Removals', path: '/removals' },
  { label: 'Brokers', path: '/brokers' },
];

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-primary text-primary-foreground">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
          <BrandMark />
          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `relative py-1 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-300 ${
                    isActive ? 'text-primary-foreground' : 'text-primary-foreground/50 hover:text-primary-foreground/90'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      className={`absolute -bottom-[21px] left-0 right-0 h-px transition-opacity duration-300 ${
                        isActive ? 'bg-primary-foreground opacity-100' : 'opacity-0'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex gap-5 overflow-x-auto border-t border-white/10 px-5 py-3 md:hidden">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] ${
                  isActive ? 'text-primary-foreground' : 'text-primary-foreground/45'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <span className="label-mono">PrivacyShield — free, and yours alone</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Your data is never shared or sold
          </span>
        </div>
      </footer>
    </div>
  );
}