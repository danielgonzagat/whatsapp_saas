export default function Loading() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 2,
      background: 'linear-gradient(90deg, transparent, #E85D30, transparent)',
      animation: 'kloel-loading 1.5s ease-in-out infinite',
      zIndex: 9999,
    }}>
      <style>{`@keyframes kloel-loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
    </div>
  );
}
