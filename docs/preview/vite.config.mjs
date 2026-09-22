import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, '../../AionUi');
export default {
  root: here,
  resolve: { alias: {
    react: path.join(ui, 'node_modules/react'),
    'react-dom': path.join(ui, 'node_modules/react-dom'),
    '@arco-design/web-react': path.join(ui, 'node_modules/@arco-design/web-react'),
    i18next: path.join(ui, 'node_modules/i18next'),
    'react-i18next': path.join(ui, 'node_modules/react-i18next'),
  } },
  server: { host: '127.0.0.1', port: 5188, strictPort: true, fs: { allow: [path.resolve(here, '../..')] } },
};
