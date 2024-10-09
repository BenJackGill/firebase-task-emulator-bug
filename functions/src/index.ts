import * as admin from "firebase-admin";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { getFunctions } from "firebase-admin/functions";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import * as logger from "firebase-functions/logger";
import { GoogleAuth } from "google-auth-library";

// Initialize the Firebase app
admin.initializeApp();

let auth: GoogleAuth | null = null;

// TypeScript remake of this function: https://firebase.google.com/docs/functions/task-functions?gen=2nd#retrieve_and_include_the_target_uri
const getFunctionUrl = async (region: string, name: string) => {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    console.log("Using emulator");
    return `http://127.0.0.1:5001/demo-project/${region}/${name}`;
  }

  if (!auth) {
    auth = new GoogleAuth({
      scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
  }

  const projectId: string = await auth.getProjectId();
  const url = `https://cloudfunctions.googleapis.com/v2beta/projects/${projectId}/locations/${region}/functions/${name}`;

  interface ServiceConfig {
    uri?: string;
  }

  interface DataResponse {
    serviceConfig?: ServiceConfig;
  }

  interface ClientResponse {
    data: DataResponse;
  }

  const client = await auth.getClient();
  const res: ClientResponse = await client.request({ url });
  const uri: string | undefined = res.data?.serviceConfig?.uri;

  if (!uri) {
    throw new HttpsError(
      "unknown",
      `Unable to retrieve uri for function at ${url}`
    );
  }

  return uri;
};

// The http function
export const testOnRequest = onRequest(async (request, response) => {
  const taskPayload = {
    foo: "bar",
  };

  const taskFunctionName = "testOnTaskDispatched";
  const queue = getFunctions().taskQueue(taskFunctionName);
  const functionUrl = await getFunctionUrl("us-central1", taskFunctionName);

  try {
    await queue.enqueue(taskPayload, {
      uri: functionUrl,
    });
  } catch (error) {
    console.error("Error scheduling task", error);
    response.status(500).send("Error scheduling task");
    return;
  }
  response.send("Success. Hello from HTTP onRequest!");
});

// The task function
export const testOnTaskDispatched = onTaskDispatched((request) => {
  logger.info("Success. Hello logs from TASKS onTaskDispatched!", {
    foo: request.data,
  });
});
