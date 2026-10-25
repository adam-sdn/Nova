// Side-effect import: the message routes import this so createMessage/recheckMessage use the real pipeline.
import { registerTranslationAgent } from "./index";

registerTranslationAgent();
