/**
 * Runs async jobs strictly one after another, in the order they were enqueued.
 *
 * Needed for worker → IndexedDB hand-off: worker messages arrive faster than
 * bulkAdd can finish, and an `async` onmessage handler runs every message
 * concurrently — which let the final "done" message overtake chunks that were
 * still being written. Funnelling the messages through this queue guarantees
 * "done" is only processed after every earlier chunk has been saved.
 */
export function createSerialQueue(onError: (e: unknown) => void | Promise<void>) {
  let chain: Promise<void> = Promise.resolve()
  return function enqueue(job: () => void | Promise<void>): Promise<void> {
    chain = chain.then(job).catch(onError)
    return chain
  }
}
