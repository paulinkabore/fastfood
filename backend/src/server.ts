import { app } from './app';
import { env } from './config/env';

app.listen(env.PORT, () => {
  console.log(`API démarrée sur http://localhost:${env.PORT}`);
});