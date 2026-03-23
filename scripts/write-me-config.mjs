import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const dest = join(process.cwd(), 'src/data/config.me.yml');
const content = process.env.ME_CONFIG;

if (content) {
	writeFileSync(dest, content, 'utf-8');
	console.log('[me-config] config.me.yml written from ME_CONFIG environment variable.');
} else if (!existsSync(dest)) {
	// No env var and no local file — write a placeholder so the build doesn't crash.
	writeFileSync(dest, 'categories: []\n', 'utf-8');
	console.log('[me-config] ME_CONFIG not set and no local config.me.yml found — wrote empty placeholder.');
} else {
	console.log('[me-config] ME_CONFIG not set — using existing local config.me.yml.');
}
