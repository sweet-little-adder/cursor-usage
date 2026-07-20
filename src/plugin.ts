import streamDeck from "@elgato/streamdeck";

import { UsageRing } from "./actions/usage-ring";

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new UsageRing());
streamDeck.connect();
