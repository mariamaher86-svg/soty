// The app's icon ("النغمة") inside the app too, so the header and the welcome look like the home-screen icon.

export const LOGO_SRC = `${import.meta.env.BASE_URL}icons/icon.svg`;

export function AppLogo({ size = 28 }: { size?: number }) {
  return <img className="app-logo" src={LOGO_SRC} width={size} height={size} alt="" aria-hidden="true" />;
}
