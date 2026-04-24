import './_styles/colors_and_type.css';
import './_styles/ambient-fx.css';
import BureauEmberField from '../_ui/BureauEmberField';

export default function BureauLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fx-atmosphere fx-embers fx-flicker fx-smoke">
      <BureauEmberField />
      {children}
    </div>
  );
}
