##
## Creates multiple emoji mosaics from a video and strings them into an MP4
##
class VideoMaker
  def initialize(options = {})
    @options = options
    @filename = options[:filename]
    @fps = options[:fps] || 10
    @generator = EmojiMosaicGenerator.new(options)
    @tmp_dir = 'tmp'
    @name = File.basename(@filename, File.extname(@filename))
    @frame_pattern = File.join(@tmp_dir, "#{@name}-%05d.png")
    @mosaic_pattern = File.join(@tmp_dir, "#{@name}-%05d-mosaic.png")
  end

  def make_emoji_video
    ensure_tmp_dir
    clean_tmp_for_run
    extract_frames
    mosaic_frames
    write_video
  end

  private

  def ensure_tmp_dir
    Dir.mkdir(@tmp_dir) unless Dir.exist?(@tmp_dir)
  end

  def clean_tmp_for_run
    Dir.glob(File.join(@tmp_dir, "#{@name}-*.png")).each do |file|
      File.delete(file)
    end
  end

  def extract_frames
    run!([ffmpeg_path, "-y", "-i", @filename, "-vf", "fps=#{@fps}", @frame_pattern], "extracting frames")
    @frames = Dir.glob(File.join(@tmp_dir, "#{@name}-*.png")).sort
    @frames.reject! { |f| f.end_with?('-mosaic.png') }
  end

  def mosaic_frames
    @mosaic_frames = []
    @frames.each_with_index do |frame, index|
      puts "\nDoing frame #{index + 1}/#{@frames.length}" unless @options[:quiet]
      @mosaic_frames << @generator.create_image(frame)
    end
  end

  def write_video
    output_filename = output_path
    run!([ffmpeg_path, "-y", "-framerate", @fps.to_s, "-i", @mosaic_pattern, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", @fps.to_s, output_filename], "encoding video")
    output_filename
  end

  def output_path
    dir = File.dirname(@filename)
    base = File.basename(@filename, File.extname(@filename))
    File.join(dir, "#{base}-mosaic.mp4")
  end

  def run!(cmd, label)
    puts "\n#{label}..." unless @options[:quiet]
    success = system(*cmd)
    raise "#{label} failed (is ffmpeg installed and on your PATH?)" unless success
  end

  def ffmpeg_path
    local = File.expand_path("../bin/ffmpeg", __dir__)
    return local if File.exist?(local)
    "ffmpeg"
  end
end
