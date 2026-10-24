/** โลโก้ตัวอักษร: "Jinx" หมึกพลัม + ตัว O เป็นเหรียญสีชมพู */
export function Logo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const big = size === 'lg';
  return (
    <span className={`inline-flex items-center font-display font-semibold tracking-tight ${big ? 'text-6xl sm:text-7xl' : 'text-2xl'}`}>
      Jinx
      <span
        className={`ml-1 inline-flex items-center justify-center rounded-full border-ink bg-jinx text-white ${
          big ? 'h-[0.95em] w-[0.95em] border-[4px] shadow-chunk-lg' : 'h-[1em] w-[1em] border-[2.5px] shadow-chunk-sm'
        }`}
      >
        <span className={`rounded-full border-ink bg-paper ${big ? 'h-[0.32em] w-[0.32em] border-[3px]' : 'h-[0.32em] w-[0.32em] border-2'}`} />
      </span>
    </span>
  );
}
