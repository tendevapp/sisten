import ModuleHome from '../ModuleHome';
import type { Profile } from '../../types';

export default function PlanejamentoHome({ user, onNavigate }: { user: Profile; onNavigate: (path: string) => void }) {
  return <ModuleHome user={user} onNavigate={onNavigate} moduleId="planejamento" />;
}
