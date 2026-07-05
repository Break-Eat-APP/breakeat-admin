import { registerRootComponent } from 'expo';
import App from './App';

// Expo's generated native AppDelegate (iOS/Android) always looks for the
// component registered as "main" — registerRootComponent guarantees that,
// unlike AppRegistry.registerComponent(appName, ...) which used app.json's
// "name" ("BratEat") and left "main" unregistered, crashing the app right
// after the native splash screen.
registerRootComponent(App);
