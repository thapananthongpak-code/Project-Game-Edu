export function Stars({ count, total = 3 }: { count: number; total?: number }) {
  return (
    <span className="text-xl leading-none tracking-wider" role="img" aria-label={`${count}/${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} aria-hidden="true" className={i < count ? "text-hint [text-shadow:0_0_1px_#1a1c2c,1px_1px_0_#1a1c2c]" : "text-slate"}>
          {i < count ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}
