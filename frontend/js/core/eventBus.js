// eventBus.js

const subscribers = {};

export const EventBus = {
  subscribe(eventName, callback) {
    if (!subscribers[eventName]) {
      subscribers[eventName] = [];
    }
    subscribers[eventName].push(callback);
    console.log(
      `[EventBus] Subscribed to ${eventName}, len is ${subscribers[eventName].length}`,
    );

    // Return an unsubscribe function
    return () => {
      if (subscribers[eventName]) {
        subscribers[eventName] = subscribers[eventName].filter(
          (cb) => cb !== callback,
        );
        console.log(`[EventBus] Unsubscribed from ${eventName}`);
      }
    };
  },

  publish(eventName, data) {
    if (subscribers[eventName]) {
      console.log(`[EventBus] Publishing ${eventName}`, data);

      subscribers[eventName].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in subscriber for ${eventName}:`, error);
        }
      });
    } else {
      console.log(`[EventBus] No subscribers for ${eventName}`);
    }
  },
};
