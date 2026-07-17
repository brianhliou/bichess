// Result reporting for the prod smoke scripts: one JSON line on stdout.
// release-prod.mjs and the CI workflows consume this output, so the shape is
// part of the smoke contract; failures are thrown by the smokes and surface as
// a nonzero exit, never as an ok:false line here.

export function reportResult(result) {
  console.log(JSON.stringify(result));
}
