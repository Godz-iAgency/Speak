import {test,expect} from 'vitest';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
test('presigned browser PUT does not require the checksum of an empty body',async()=>{
 const client=new S3Client({region:'us-west-004',endpoint:'https://s3.us-west-004.backblazeb2.com',credentials:{accessKeyId:'TEST',secretAccessKey:'TEST'},requestChecksumCalculation:'WHEN_REQUIRED'});
 const url=new URL(await getSignedUrl(client,new PutObjectCommand({Bucket:'test',Key:'video.mp4',ContentType:'video/mp4'}),{expiresIn:600}));
 expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);expect(url.searchParams.get('X-Amz-Expires')).toBe('600');client.destroy();
});
