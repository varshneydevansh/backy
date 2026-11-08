import type {
  BackyInteractiveComponentLifecycleContract,
  BackyInteractiveComponentsContract,
  BackyInteractiveRuntimeEventType,
  GeneratedBackyOpenApiInteractiveComponentLifecycleContract,
  GeneratedBackyOpenApiInteractiveComponentManifestContract,
  GeneratedBackyFrontendManifestEnvelope,
} from '../src/index';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type SdkLifecycleParity = Assert<Equal<BackyInteractiveComponentLifecycleContract, GeneratedBackyOpenApiInteractiveComponentLifecycleContract>>;
export type SdkDiscoveryLifecycleParity = Assert<Equal<NonNullable<BackyInteractiveComponentsContract['renderContract']['lifecycle']>, BackyInteractiveComponentLifecycleContract>>;
export type OpenApiLifecycleParity = Assert<Equal<NonNullable<GeneratedBackyOpenApiInteractiveComponentManifestContract['renderContract']['lifecycle']>, BackyInteractiveComponentLifecycleContract>>;
type ManifestInteractive = NonNullable<GeneratedBackyFrontendManifestEnvelope['data']['modules']['interactiveComponents']>;
export type ManifestLifecycleParity = Assert<Equal<NonNullable<ManifestInteractive['renderContract']['lifecycle']>, BackyInteractiveComponentLifecycleContract>>;

declare const lifecycle: BackyInteractiveComponentLifecycleContract;
const success: true = lifecycle.messages.rendered.successfulRender;
const readiness: false = lifecycle.messages.ready.successfulRender;
const measurement: false = lifecycle.messages.resize.successfulRender;
const initialization: 'parent-to-sandbox' = lifecycle.messages.init.direction;
const reply: 'sandbox-to-parent' = lifecycle.messages.rendered.direction;
const completion: 'backy.interactive-component.rendered' = lifecycle.messages.rendered.type;
const telemetry: false = lifecycle.completionIsDiagnosticTelemetry;
const revocation: false = lifecycle.review.proactiveRunningFrameRevocation;
const receiver: 'current-iframe-contentWindow' = lifecycle.receiverValidation.hostReplySource;
const legacy: BackyInteractiveComponentsContract['renderContract'] = {
  fields: [], hydrationModes: [], postMessageProtocol: 'backy.interactive-component.v1',
  fallbackRequired: true, unknownComponentBehavior: 'render-static-fallback',
  extension: { preserve: [false, 0] },
};
const future: BackyInteractiveComponentLifecycleContract = {
  ...lifecycle, extension: { preserve: [false, 0] },
  messages: { ...lifecycle.messages, rendered: { ...lifecycle.messages.rendered, extension: { retained: true } } },
};
// @ts-expect-error Completion control traffic does not expand the diagnostic telemetry enum.
const wrongDiagnostic: BackyInteractiveRuntimeEventType = 'rendered';
// @ts-expect-error Import readiness cannot be used as successful completion.
const wrongSuccess: true = lifecycle.messages.ready.successfulRender;
// @ts-expect-error Resize is not a success reply.
const wrongResize: true = lifecycle.messages.resize.successfulRender;
// @ts-expect-error Initialization is a parent command, not a sandbox reply.
const wrongDirection: 'sandbox-to-parent' = lifecycle.messages.init.direction;
// @ts-expect-error A completion reply must carry the rendered event identity.
const wrongEvent: 'backy.interactive-component.ready' = lifecycle.messages.rendered.type;
// @ts-expect-error Current behavior does not certify active frame revocation.
const wrongRevocation: true = lifecycle.review.proactiveRunningFrameRevocation;
// @ts-expect-error Completion remains control traffic outside diagnostic telemetry.
const wrongTelemetry: true = lifecycle.completionIsDiagnosticTelemetry;
void [success, readiness, measurement, initialization, reply, completion, telemetry, revocation, receiver, legacy, future,
  wrongDiagnostic, wrongSuccess, wrongResize, wrongDirection, wrongEvent, wrongRevocation, wrongTelemetry];
