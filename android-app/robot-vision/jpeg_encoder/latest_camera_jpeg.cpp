// MPL-2.0. Encode the newest available color frame without growing a work queue.
#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <csetjmp>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <thread>
#include <utility>

#include <jpeglib.h>
#include <rclcpp/rclcpp.hpp>
#include <sensor_msgs/msg/compressed_image.hpp>
#include <sensor_msgs/msg/image.hpp>

using Image = sensor_msgs::msg::Image;
using CompressedImage = sensor_msgs::msg::CompressedImage;

class JpegEncoder {
 public:
  explicit JpegEncoder(int quality) : quality_(quality) {
    encoder_.err = jpeg_std_error(&error_.manager);
    error_.manager.error_exit = [](j_common_ptr encoder) {
      auto *error = reinterpret_cast<Error *>(encoder->err);
      longjmp(error->target, 1);
    };
    jpeg_create_compress(&encoder_);
  }
  ~JpegEncoder() { jpeg_destroy_compress(&encoder_); }

  bool encode(const Image &image, CompressedImage &message) {
    if (image.width == 0 || image.height == 0 ||
        (image.encoding != "rgb8" && image.encoding != "bgr8") ||
        image.step < static_cast<size_t>(image.width) * 3 ||
        image.data.size() < static_cast<size_t>(image.step) * image.height) {
      return false;
    }
    if (setjmp(error_.target)) {
      jpeg_abort_compress(&encoder_);
      std::free(buffer_);
      return false;
    }
    buffer_ = nullptr;
    size_ = 0;
    jpeg_mem_dest(&encoder_, &buffer_, &size_);
    encoder_.image_width = image.width;
    encoder_.image_height = image.height;
    encoder_.input_components = 3;
    encoder_.in_color_space = image.encoding == "rgb8" ? JCS_RGB : JCS_EXT_BGR;
    jpeg_set_defaults(&encoder_);
    jpeg_set_quality(&encoder_, quality_, TRUE);
    jpeg_start_compress(&encoder_, TRUE);
    while (encoder_.next_scanline < encoder_.image_height) {
      auto row = const_cast<JSAMPROW>(image.data.data() + encoder_.next_scanline * image.step);
      jpeg_write_scanlines(&encoder_, &row, 1);
    }
    jpeg_finish_compress(&encoder_);
    const std::unique_ptr<unsigned char, decltype(&std::free)> buffer(buffer_, &std::free);
    message.header = image.header;
    message.format = "jpeg";
    message.data.assign(buffer.get(), buffer.get() + size_);
    return true;
  }

 private:
  struct Error {
    jpeg_error_mgr manager{};
    jmp_buf target;
  } error_;
  jpeg_compress_struct encoder_{};
  int quality_;
  unsigned char *buffer_ = nullptr;
  unsigned long size_ = 0;
};

class LatestCameraJpeg : public rclcpp::Node {
 public:
  LatestCameraJpeg() : Node("gemini345lg_rgb_jpeg"),
    encoder_(std::clamp<int64_t>(declare_parameter("quality", 80), 1, 100)) {
    publisher_ = create_publisher<CompressedImage>("/camera/color/image_raw/compressed", rclcpp::QoS(1));
    subscription_ = create_subscription<Image>("/camera/color/image_raw", rclcpp::SensorDataQoS().keep_last(1),
      [this](Image::ConstSharedPtr image) {
        {
          const std::lock_guard<std::mutex> lock(mutex_);
          latest_ = std::move(image);
        }
        ready_.notify_one();
      });
    worker_ = std::thread([this] { run(); });
  }

  ~LatestCameraJpeg() override {
    {
      const std::lock_guard<std::mutex> lock(mutex_);
      stopping_ = true;
    }
    ready_.notify_one();
    worker_.join();
  }

 private:
  void run() {
    for (;;) {
      Image::ConstSharedPtr image;
      {
        std::unique_lock<std::mutex> lock(mutex_);
        ready_.wait(lock, [this] { return stopping_ || latest_; });
        if (stopping_) return;
        image = std::exchange(latest_, {});
      }
      if (publisher_->get_subscription_count() == 0) continue;
      auto message = std::make_unique<CompressedImage>();
      if (encoder_.encode(*image, *message) && rclcpp::ok()) {
        try {
          publisher_->publish(std::move(message));
        } catch (const rclcpp::exceptions::RCLError &) {
          if (!rclcpp::ok()) return;
          RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 5000, "Failed to publish JPEG frame");
        }
      }
    }
  }

  JpegEncoder encoder_;
  rclcpp::Publisher<CompressedImage>::SharedPtr publisher_;
  rclcpp::Subscription<Image>::SharedPtr subscription_;
  std::mutex mutex_;
  std::condition_variable ready_;
  Image::ConstSharedPtr latest_;
  bool stopping_ = false;
  std::thread worker_;
};

int main(int argc, char **argv) {
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<LatestCameraJpeg>());
  rclcpp::shutdown();
}
