let gulp = require('gulp');
let sass = require('gulp-sass');

gulp.task('styles', function() {
  return gulp.src('./src/public/sass/**/*.scss')
    .pipe(sass({outputStyle: 'compressed'}).on('error', sass.logError))
    .pipe(gulp.dest('./src/public/css/'));
});

gulp.task('scripts', function() {
  return gulp.src('./node_modules/paper/dist/paper-full.min.js')
    .pipe(gulp.dest('./src/public/js/'));
});

//Watch task
gulp.task('default', function() {
  return gulp.watch('./src/public/sass/**/*.scss', gulp.series('styles'));
});
