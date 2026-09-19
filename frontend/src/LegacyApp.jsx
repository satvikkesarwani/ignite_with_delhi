/**
 * The original dev-playground app, wrapped so its global stylesheet loads ONLY
 * when it is actually rendered.
 *
 * index.css contains an unlayered `* { margin: 0; padding: 0 }` reset, and
 * unlayered CSS beats every Tailwind utility (which live in a cascade layer)
 * regardless of specificity. Loaded globally it silently deleted all padding
 * and margin in the CRM. Keeping it inside this lazy chunk means "/" and
 * "/crm" can never affect one another.
 */
import './index.css';
import App from './App.jsx';

export default App;
