export function ConnectingScreen() {
  return (
    <div className="connecting-screen" style={{ backgroundColor: "#070a08" }} role="status" aria-live="polite">
      <div className="connecting-mark">
        <span className="connecting-halo" aria-hidden />
        <span className="connecting-orbit" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/storely-logo.png" alt="" className="connecting-logo" />
      </div>
      <p className="connecting-label">מתחברים למערכת ניהול</p>
    </div>
  );
}
