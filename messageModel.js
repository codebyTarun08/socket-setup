import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "mixed"],
      default: "text",
    },
    text: {
      type: String,
      required: true,
      default:"",
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { 
    timestamps: true 
  }
);

export default mongoose.models.Message ||
  mongoose.model("Message", messageSchema);
