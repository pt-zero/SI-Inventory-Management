import { Card } from '@/components/ui/card.jsx';

function StatCard({ 
    label, 
    value, 
    tone, 
    icon: Icon,
    onClick,
    isActive = false,
}) {
  return (
    <Card
      className={`stat-card ${tone}${onClick ? ' stat-card-actionable' : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? isActive : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <div className="stat-card-heading">
        <p>{label}</p>
        <Icon aria-hidden="true" />
      </div>
      <strong>{value}</strong>
    </Card>
  );
}

export default StatCard;