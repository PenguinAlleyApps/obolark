import './_styles/colors_and_type.css';
import './_styles/ambient-fx.css';

export default function BureauLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fx-atmosphere" aria-hidden />
      {children}
    </>
  );
}
