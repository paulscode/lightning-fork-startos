/**
 * The bridge's SHA256 node's ports, clear of Lightning Fork's own (9735,
 * 10009, 8080) in the network namespace the two daemons share. gRPC is where
 * Lightning Fork's bridge dials it, at the default bridgerpc.sha256.rpchost.
 *
 * A module of its own, importing nothing: interfaces.ts needs the peer port,
 * and importing it from sha256Node.ts made a cycle (utils, interfaces,
 * sha256Node, utils) in which sha256Node read lndDataDir before utils had set
 * it, so the package failed to load.
 */
export const sha256P2pPort = 9739
export const sha256GrpcPort = 10019
export const sha256RestPort = 8089
