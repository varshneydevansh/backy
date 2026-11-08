import { runMediaFileStreamingChecks, mediaFileStreamingFixture } from './media-file-streaming-fixture.mts';
if(process.argv.length>2)throw Error('External targets are not accepted.');
console.log(JSON.stringify({database:await runMediaFileStreamingChecks(),demo:await runMediaFileStreamingChecks(mediaFileStreamingFixture(true)),legacy:await runMediaFileStreamingChecks(mediaFileStreamingFixture(false,false))}));
