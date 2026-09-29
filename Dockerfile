# The read-only Roblox security set, served by the same entry point the npm
# package ships. There is no build step, so this is a single stage: a builder
# stage would copy the same files twice to produce a smaller context, not a
# smaller image.
#
# Everything not copied below is how the set gets authored and checked - the
# tests, the wiki, the instruction set, the repository's own plans. None of it
# is part of what a client connects to.

FROM node:22-alpine

# Satisfies the `engines.node: ">=20"` in package.json, so adding this file
# forces no version change.
WORKDIR /srv

# Dependencies first, so an edit under src/ does not invalidate the install
# layer.
#
# --ignore-scripts keeps an install hook from running anything this image does
# not need. --omit=dev drops dev dependencies: this repository declares none
# today, package.json has exactly two entries and both are runtime, so the flag
# removes nothing right now. It is kept anyway - a no-op until dev dependencies
# arrive, and a guard afterwards, rather than a flag added in the same commit
# as the first one.
#
# node_modules is installed here and never copied from the host, so a
# Windows-native tree in the build context cannot leak into a Linux image.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

COPY src ./src
COPY content ./content

# node:22-alpine ships an unprivileged `node` user. Everything copied above is
# world-readable by default, so this needs no chmod and no `USER root` step
# before it.
USER node

# 3000 is src/index.js's default port in http mode (`PORT ?? "3000"`).
#
# EXPOSE declares a port; it does not publish one - `docker run -p 3000:3000` is
# what makes it reachable from the host. The declaration is here because the
# listener is real and already existed: src/index.js has served streamable HTTP
# since the transport was written. This documents a port the image has always
# listened on, it does not open a new one.
EXPOSE 3000

# Transport selection is an environment variable, not an entry-point override.
#
#   stdio, the default
#     docker run --rm -i rbagents-security:0.1.0
#
#   streamable HTTP
#     docker run --rm -p 3000:3000 -e MCP_TRANSPORT=http rbagents-security:0.1.0
#     curl -s http://localhost:3000/healthz
#
# Three things bite on these forms, and all three fail quietly:
#
#   -i is not optional on stdio. Without it the server sees a closed stdin and
#   exits at once, which reads as a broken image rather than a missing flag.
#
#   -p is what publishes the port. EXPOSE on its own does nothing.
#
#   -e must come BEFORE the image name. After it, Docker accepts the flag
#   silently, the container serves stdio, and curl hangs - which reads as a
#   broken image rather than a misplaced flag.
#
# There is no second image for HTTP. The two forms share every byte of payload
# and differ by one variable, so a second image would only let the two drift.
ENTRYPOINT ["node", "src/index.js"]
